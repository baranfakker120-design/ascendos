// ============================================================
// coach-chat: Der eine Coach mit Spezialisten dahinter (ADR-011).
// Ablauf: Auth -> Limit -> Kontext laden (unter RLS des Nutzers!)
// -> Router -> Retrieval (pgvector) -> Antwort -> persistieren.
// Der Client schickt nur contactId + Nachricht; allen Kontext
// baut der Server selbst (Sprint-4-Prinzip: Kontext-first).
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
// Embeddings: ausschliesslich Gemini, unveraendert (Betreiberentscheidung
// vom 29. Juli 2026 -- eine andere Dimension wuerde RAG veraendern).
import { geminiEmbed } from '../_shared/gemini.ts';
// Chat: Provider-Abstraktion vom 30. Juli 2026. Reihenfolge Groq ->
// OpenRouter -> Cerebras mit automatischem Fallback, siehe die
// Provider-Abstraktion unter _shared (Ordner ai-providers).
import {
  AllProvidersFailedError,
  chat,
  type ChatMessage,
} from '../_shared/ai-providers/index.ts';
import { CORE_RULES, ROUTER_PROMPT } from '../_shared/prompts.ts';
// Intent-Router, Sprint 3.1: pro-Nachricht-Klassifikation der
// Wissenskategorie, unabhaengig vom bestehenden Einmal-pro-Konversation-
// Router oben (ROUTER_PROMPT). Siehe intent-router/types.ts fuer die
// Abgrenzung der beiden Mechanismen.
import { classifyIntent } from '../_shared/intent-router/index.ts';
import { stripMarkdown } from '../_shared/format/strip-markdown.ts';

const PHASE_LABELS: Record<string, string> = {
  lead: 'Lead',
  im_gespraech: 'Im Gespräch',
  praesentation_offen: 'Präsentation gesendet',
  praesentation: 'Präsentation gesehen',
  fit_check: 'Fit Check abgeschlossen',
  three_way_call: '3-Way-Call durchgeführt',
  kunde: 'Kunde',
  partner: 'Partner',
};

const EVENT_LABELS: Record<string, string> = {
  contact_created: 'Kontakt erstellt',
  first_touch: 'Erstes Gespräch',
  follow_up: 'Follow-up',
  presentation_sent: 'Präsentation gesendet',
  presentation_viewed: 'Präsentation angesehen',
  fit_check_sent: 'Fit Check gesendet',
  fit_check_completed: 'Fit Check abgeschlossen',
  waytomoon_sent: 'WayToMoon gesendet',
  three_way_call_done: '3-Way-Call durchgeführt',
  party_scheduled: 'Duftparty geplant',
  party_done: 'Duftparty durchgeführt',
  became_customer: 'Kunde geworden',
  registered: 'Als Partner registriert',
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, since: number) => { timings[key] = Date.now() - since; };
  try {
    // User-Client mit dem JWT des Aufrufers: JEDE Datenbankoperation
    // in dieser Function läuft unter der RLS des Nutzers (ADR-002/014).
    const authHeader = req.headers.get('Authorization') ?? '';
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authError } = await db.auth.getUser();
    if (authError || !userData.user) return json({ error: 'Nicht angemeldet.' }, 401);
    const userId = userData.user.id;

    const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return json({ error: 'Kein Profil gefunden.' }, 403);

    // Kostenkontrolle: Tageslimit aus den Org-Einstellungen (ADR-007).
    const { data: org } = await db
      .from('organizations')
      .select('settings')
      .eq('id', profile.org_id)
      .single();
    const dailyLimit = Number(org?.settings?.coach_daily_message_limit ?? 50);
    // Schwellwert für die Wissenssuche. Default bewusst niedriger als der
    // alte OpenAI-Wert (0.25): Gemini-Cosine-Werte liegen im Schnitt
    // niedriger, ein zu hoher Wert liefert schlicht keine Dokumente.
    const rawMinSim = Number(org?.settings?.coach_min_similarity);
    const minSimilarity =
      Number.isFinite(rawMinSim) && rawMinSim >= 0 && rawMinSim <= 1 ? rawMinSim : 0.2;
    const { data: usedToday } = await db.rpc('coach_messages_today', { p_user: userId });
    if ((usedToday ?? 0) >= dailyLimit) {
      return json({
        error: `Tageslimit erreicht (${dailyLimit} Nachrichten). Morgen geht es weiter.`,
      }, 429);
    }

    const body = await req.json();
    const message = String(body.message ?? '').trim();
    const contactId = body.contactId ? String(body.contactId) : null;
    let convoId = body.conversationId ? String(body.conversationId) : null;
    if (!message) return json({ error: 'Leere Nachricht.' }, 400);

    // ---------- Kontext: Kontakt + Phase + letzte Events ----------
    const tContext = Date.now();
    let contactContext = '';
    if (contactId) {
      const [contact, phase, events] = await Promise.all([
        db.from('contacts').select('*').eq('id', contactId).single(),
        db.from('contact_phases').select('*').eq('contact_id', contactId).single(),
        // [N-1] Wirksame Events (Korrekturen herausgerechnet) — der Coach
        // sieht dieselbe Wahrheit wie Phase-Ableitung und Regel-Engine.
        db.from('effective_pipeline_events').select('event_type, occurred_at')
          .eq('contact_id', contactId).order('occurred_at', { ascending: false }).limit(6),
      ]);
      if (!contact.data) return json({ error: 'Kontakt nicht gefunden.' }, 404);

      const days = phase.data?.last_event_at
        ? Math.floor((Date.now() - new Date(phase.data.last_event_at).getTime()) / 86_400_000)
        : null;
      // Explizit typisiert: unter `strict` ist ein impliziter any hier ein
      // Fehler (blockiert `deno check`), und der Coach-Kontext darf nie ein
      // rohes "undefined" enthalten.
      const eventRows = (events.data ?? []) as Array<{ event_type: string; occurred_at: string }>;
      const phaseKey: string = phase.data?.phase ?? 'lead';

      const lines = [
        `Name: ${contact.data.name}`,
        `Pipeline-Phase: ${PHASE_LABELS[phaseKey] ?? phaseKey}`,
        `Letzter Kontakt: ${days === null ? 'noch nie' : days === 0 ? 'heute' : `vor ${days} Tag(en)`}`,
        contact.data.next_step ? `Geplanter nächster Schritt: ${contact.data.next_step}` : null,
        contact.data.notes ? `Notizen: ${contact.data.notes}` : null,
        'Letzte Ereignisse (neueste zuerst):',
        ...eventRows.map(
          (e) =>
            `- ${EVENT_LABELS[e.event_type] ?? e.event_type} (${String(e.occurred_at).slice(0, 10)})`
        ),
      ].filter(Boolean);
      contactContext = `KONTAKT-KONTEXT (aus der Pipeline des Nutzers, bereits bekannt):\n${lines.join('\n')}`;
    }

    mark('context_ms', tContext);

    // ---------- Konversation laden/anlegen ----------
    let history: ChatMessage[] = [];
    let agentKey: string | null = null;
    if (convoId) {
      const { data: convo } = await db.from('coach_convos').select('*').eq('id', convoId).single();
      if (!convo) return json({ error: 'Konversation nicht gefunden.' }, 404);
      agentKey = convo.agent_key;
      const { data: msgs } = await db.from('coach_messages')
        .select('role, content').eq('convo_id', convoId)
        .order('created_at').limit(20);
      history = (msgs ?? []) as ChatMessage[];
    } else {
      const { data: convo, error } = await db.from('coach_convos')
        .insert({ user_id: userId, org_id: profile.org_id, contact_id: contactId })
        .select().single();
      if (error) throw error;
      convoId = convo.id;
    }

    // ---------- Router: einmal pro Konversation (ADR-011) ----------
    const tRouter = Date.now();
    if (!agentKey) {
      // Der Router darf den Coach nie blockieren: faellt die Klassifikation
      // aus, greift der sichere Default 'knowledge'.
      let routed = '';
      try {
        routed = (
          await chat({
            system: ROUTER_PROMPT,
            messages: [{ role: 'user', content: message }],
            maxTokens: 16,
          })
        ).text
          .trim()
          .toLowerCase();
      } catch (e) {
        console.warn('router fallback', e instanceof Error ? e.message : e);
      }
      agentKey = ['recruiting', 'sales', 'knowledge'].includes(routed) ? routed : 'knowledge';
      await db.from('coach_convos').update({ agent_key: agentKey }).eq('id', convoId);
    }

    mark('router_ms', tRouter);

    const { data: agent } = await db.from('agents')
      .select('*').eq('org_id', profile.org_id).eq('key', agentKey).single();
    if (!agent) return json({ error: 'Kein Coach konfiguriert.' }, 500);

    // ---------- Intent-Router (Sprint 3.1): pro Nachricht neu ----------
    // Bestimmt NUR die Wissenskategorie fuer DIESEN Turn. Bei niedriger
    // Konfidenz (fallbackToAgent=true) bleibt das bestehende Verhalten
    // ueber agent.retrieval_categories unveraendert -- keine Regression.
    const tIntent = Date.now();
    const intentResult = classifyIntent(message);

    // Kontext-Kontinuitaet bei Anschlussfragen (Sprint 3, Punkt 4).
    // Beispiel aus dem Auftrag: "129" -> "Wie riecht er?" -> "Wie lange
    // haelt er?". Die Anschlussfrage traegt fuer sich genommen kein
    // erkennbares Schluesselwort und wuerde auf den Agenten-Standard
    // zurueckfallen -- das wuerde die Kategorie mitten im Thema
    // faelschlich zuruecksetzen. Abhilfe: faellt die AKTUELLE Nachricht
    // auf 'unbekannt' zurueck UND es gibt eine vorherige Nutzernachricht
    // in der Historie, wird DIESE testweise klassifiziert. Traf sie mit
    // ausreichender Konfidenz, uebernimmt der aktuelle Turn ihre
    // KATEGORIEN. Die Suchanfrage selbst bleibt die aktuelle Frage --
    // nur die Kategorie "erbt" sich, nicht der Suchtext. Kein Schema,
    // keine neue Tabelle: die Historie liegt ohnehin schon im Speicher.
    let effectiveIntent = intentResult;
    let intentSource: 'aktuelle_nachricht' | 'vorherige_nachricht' | 'agent_default' =
      intentResult.fallbackToAgent ? 'agent_default' : 'aktuelle_nachricht';
    if (intentResult.fallbackToAgent) {
      const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        const priorIntent = classifyIntent(lastUserMsg.content);
        if (!priorIntent.fallbackToAgent) {
          effectiveIntent = { ...priorIntent, searchQuery: message };
          intentSource = 'vorherige_nachricht';
        }
      }
    }
    mark('intent_ms', tIntent);

    // ---------- Retrieval: Teamdokumente (unter RLS des Nutzers) ----------
    const tRag = Date.now();
    let knowledgeBlock = '';
    let hadKnowledge = false;
    let ragSkipped = false;
    // Fuer die Protokollierung (Sprint 3, Punkt 6): welche Dokumente und
    // wie viele Treffer tatsaechlich verwendet wurden.
    let matchedDocs: Array<{ doc_id: string; doc_title: string; similarity: number }> = [];
    let exactMatchChunkIds: string[] = [];
    if (effectiveIntent.skipRag) {
      // Intent betrifft strukturierte Nutzerdaten (Kontakte, Aufgaben),
      // nicht die Wissensdatenbank. match_knowledge wuerde in der
      // falschen Quelle suchen. Stattdessen ein kurzer, ehrlicher
      // Hinweis: das Modell soll NICHT so tun, als saehe es Kontakt-
      // oder Tagesplandaten, die es hier nicht bekommen hat.
      ragSkipped = true;
      knowledgeBlock =
        'HINWEIS: Diese Frage betrifft vermutlich eigene Kontakte oder den ' +
        'Tagesplan des Nutzers. Du hast dazu KEINEN direkten Datenzugriff ' +
        'in dieser Antwort, außer der KONTAKT-KONTEXT ist unten angegeben. ' +
        'Erfinde keine Kontakt- oder Aufgabendaten. Verweise bei Bedarf auf ' +
        'die Bereiche Kontakte bzw. Heute in der App.';
    } else {
    try {
      // RETRIEVAL_QUERY, nicht RETRIEVAL_DOCUMENT: Gemini kodiert Fragen
      // anders als Dokumente. Verwechslung kostet Trefferqualität, ohne
      // einen Fehler zu erzeugen.
      //
      // effectiveIntent.searchQuery statt der rohen Nachricht: bei Intent
      // "Duftnummer" waere die Einbettung von blossem "129" kaum nah an
      // einem Dokument, das "Duftnummer 129: ..." sagt. Ohne erkannten
      // Intent (fallbackToAgent) ist searchQuery identisch zur rohen
      // Nachricht, unveraendertes Verhalten.
      const queryEmbedding = await geminiEmbed(effectiveIntent.searchQuery, 'RETRIEVAL_QUERY');
      const { data: matches } = await db.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        p_org_id: profile.org_id,
        // Erkannter Intent ueberschreibt NUR fuer diesen Aufruf die
        // Kategorien des Agenten -- agents.retrieval_categories selbst
        // bleibt unangetastet (Auftrag: Datenbank nicht aendern).
        match_categories: !effectiveIntent.fallbackToAgent && effectiveIntent.categories.length
          ? effectiveIntent.categories
          : (agent.retrieval_categories?.length ? agent.retrieval_categories : null),
        match_count: 5,
        // Wird jetzt EXPLIZIT übergeben statt den DB-Default (0.25) zu
        // nutzen: der Wert war auf den OpenAI-Vektorraum getunt und muss
        // für Gemini neu vermessen werden. Über organizations.settings
        // justierbar — dieselbe Mechanik wie coach_daily_message_limit,
        // also ohne Schemaänderung.
        min_similarity: minSimilarity,
      });
      if (matches && matches.length > 0) {
        hadKnowledge = true;
        matchedDocs = matches.map(
          (m: { doc_id: string; doc_title: string; similarity: number }) => ({
            doc_id: m.doc_id, doc_title: m.doc_title, similarity: m.similarity,
          }),
        );
        knowledgeBlock =
          'AUSZÜGE AUS DEN TEAMDOKUMENTEN (oberste Wahrheit):\n' +
          matches.map((m: { doc_title: string; content: string }) =>
            `[${m.doc_title}]\n${m.content}`).join('\n---\n');
      }
    } catch (_e) {
      // Embedding-Ausfall darf den Coach nicht stoppen: er antwortet
      // dann ohne Dokumente und behandelt Teamfragen als Wissenslücke.
    }

    // Exakter Zahlentreffer als Ergaenzung zur Vektorsuche (Sprint 3,
    // Bugfix Punkt 1). Verifiziert gegen den echten Wissensbestand: eine
    // blanke Zahl wie "129" traegt fuer ein Einbettungsmodell kaum
    // eigenes Bedeutungsgewicht, benachbarte Nummern (128/129/130) liegen
    // im Vektorraum praktisch gleich nah beieinander. Eine exakte
    // Textsuche nach der Ziffernfolge, mit Wortgrenze (kein Teiltreffer
    // wie "1290"), ist fuer GENAU DIESEN Fall zuverlaessiger als
    // semantische Naehe. Ergaenzt die Vektorsuche, ersetzt sie nicht, und
    // nutzt ausschliesslich vorhandene Tabellen -- keine neue Funktion,
    // keine Migration. RLS greift identisch zu match_knowledge, weil
    // derselbe `db`-Client mit demselben Nutzer-JWT verwendet wird.
    if (effectiveIntent.intent === 'duft_nummer') {
      const zahl = message.match(/\d{1,4}/)?.[0];
      if (zahl) {
        try {
          const { data: kategorieDocs } = await db.from('knowledge_docs')
            .select('id, title')
            .eq('org_id', profile.org_id)
            .in('category', effectiveIntent.categories);
          const docIds = (kategorieDocs ?? []).map((d: { id: string }) => d.id);
          if (docIds.length > 0) {
            const { data: kandidaten } = await db.from('knowledge_chunks')
              .select('id, doc_id, content')
              .in('doc_id', docIds)
              .ilike('content', `%${zahl}%`)
              .limit(5);
            const wortgrenze = new RegExp(`\\b${zahl}\\b`);
            const treffer = (kandidaten ?? []).filter(
              (c: { content: string }) => wortgrenze.test(c.content),
            );
            if (treffer.length > 0) {
              hadKnowledge = true;
              exactMatchChunkIds = treffer.map((c: { id: string }) => c.id);
              const titelNachId = new Map(
                (kategorieDocs ?? []).map((d: { id: string; title: string }) => [d.id, d.title]),
              );
              const exactBlock = treffer.map(
                (c: { doc_id: string; content: string }) =>
                  `[${titelNachId.get(c.doc_id) ?? 'Wissensdokument'}]\n${c.content}`,
              ).join('\n---\n');
              // Exakter Treffer zuerst: eine konkrete Ziffer ist eine
              // staerkere Aussage als semantische Naehe.
              knowledgeBlock = knowledgeBlock
                ? `EXAKTER ZAHLENTREFFER (bevorzugt verwenden):\n${exactBlock}\n\n${knowledgeBlock}`
                : `EXAKTER ZAHLENTREFFER (bevorzugt verwenden):\n${exactBlock}`;
            }
          }
        } catch (_e) {
          // Exakte Suche darf den Coach nie stoppen; die Vektorsuche
          // bleibt dann die alleinige Quelle.
        }
      }
    }
    }
    if (!hadKnowledge && !ragSkipped) {
      // [K-1] Datenschutz: NIE die Rohfrage loggen — sie kann private
      // Kontaktdaten enthalten, und Admins lesen diese Tabelle. Die
      // Frage wird erst zu einem anonymen Wissensthema generalisiert;
      // schlägt das fehl, wird NICHT geloggt (Privacy vor Metrik).
      //
      // Nicht ausgeloest bei ragSkipped: das ist keine Wissensluecke,
      // sondern ein Intent (Kontakte/Aufgaben), der bewusst keine
      // Wissenssuche durchlaeuft. Ihn hier zu loggen wuerde die
      // Luecken-Auswertung mit Faellen verwaessern, die gar keine sind.
      try {
        const topic = (await chat({
          system:
            'Fasse die Nutzerfrage als allgemeines Wissensthema zusammen: max. 12 Wörter, ' +
            'Deutsch, OHNE Namen, Zahlen zu Personen oder persönliche Details. ' +
            'Beispiel: "Wie überzeuge ich Mehmet mit 200€ Schulden?" -> ' +
            '"Einwandbehandlung bei finanziellen Bedenken". Antworte NUR mit dem Thema.',
          messages: [{ role: 'user', content: message.slice(0, 500) }],
          maxTokens: 60,
        })).text.trim().slice(0, 200);
        if (topic.length >= 5) {
          await db.from('knowledge_gaps').insert({
            org_id: profile.org_id, user_id: userId, agent_key: agentKey, question: topic,
          });
        }
      } catch (_e) {
        // bewusst kein Fallback auf die Rohfrage
      }
    }

    mark('rag_ms', tRag);

    // ---------- Antwort ----------
    const system = [
      CORE_RULES,
      `DEINE SPEZIALISIERUNG:\n${agent.system_prompt}`,
      `NUTZER: ${profile.first_name} (Rolle: ${profile.role}).`,
      contactContext || null,
      knowledgeBlock ||
        'HINWEIS: Zu dieser Frage wurden KEINE Teamdokumente gefunden. Beachte die Wissensbasis-Regel.',
    ].filter(Boolean).join('\n\n');

    const tLlm = Date.now();
    // agent.model wird hier bewusst NICHT gelesen: das Feld diente der
    // Uebersetzung auf eine Gemini-Modellklasse (mapToGeminiModel), ein
    // Konzept, das mit der Provider-Abstraktion entfaellt. Jeder Anbieter
    // verwendet sein eigenes fest gewaehltes Modell, siehe die Adapter
    // groq.ts, openrouter.ts und cerebras.ts unter _shared (Ordner
    // ai-providers). Das Datenbankfeld bleibt unveraendert bestehen,
    // nur ungenutzt fuer diesen Zweck -- Migration 15 verlangt, die
    // Datenbank hier nicht anzufassen.
    const chatResult = await chat({
      system,
      messages: [...history, { role: 'user', content: message }],
      maxTokens: 1024,
    });
    // Premium-UI rendert Markdown: HTML strippen, Struktur behalten.
    const reply = stripMarkdown(chatResult.text.trim());
    mark('llm_ms', tLlm);

    // Nie eine leere Assistant-Nachricht persistieren: sie wuerde bei jedem
    // Folge-Turn als History mitgeschickt und den Verlauf vergiften.
    if (!reply) {
      return json({ error: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.' }, 502);
    }

    await db.from('coach_messages').insert([
      { convo_id: convoId, role: 'user', content: message },
      { convo_id: convoId, role: 'assistant', content: reply },
    ]);
    await db.from('usage_events').insert({
      user_id: userId, org_id: profile.org_id, event_type: 'coach_message_sent',
      metadata: { agent_key: agentKey, had_knowledge: hadKnowledge },
    }).then(() => {}, () => {}); // Tracking bricht nie den Coach

    mark('total_ms', t0);
    // Strukturierte Metriken in die Function-Logs (ohne Inhalte, ADR-019).
    // Sprint 3 ergaenzt gegenueber 3.1: Dokumenttitel und Aehnlichkeit
    // der Vektortreffer, Chunk-IDs des exakten Zahlentreffers,
    // Gesamttrefferzahl, und ob der verwendete Intent von der aktuellen
    // Nachricht, der vorherigen Nachricht (Kontext-Kontinuitaet) oder
    // dem Agenten-Standard stammt. Dient ausschliesslich der
    // Fehlersuche, wie im Auftrag festgelegt -- keine Nutzerinhalte,
    // nur Metadaten.
    console.log(JSON.stringify({
      metric: 'coach_chat', agentKey, hadKnowledge,
      provider: chatResult.provider, providerModel: chatResult.model,
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      intentSource,
      effectiveIntent: effectiveIntent.intent,
      // KORRIGIERT gegenueber der ersten Fassung: hier stand faelschlich
      // intentResult statt effectiveIntent. Bei einer Anschlussfrage
      // (intentSource='vorherige_nachricht') haette die Logzeile sonst
      // eine andere Kategorie angezeigt als die, die tatsaechlich
      // durchsucht wurde -- irrefuehrend genau fuer die Faelle, die
      // dieses Feld nachvollziehbar machen soll.
      knowledgeCategories: ragSkipped ? [] :
        (!effectiveIntent.fallbackToAgent && effectiveIntent.categories.length
          ? effectiveIntent.categories
          : (agent.retrieval_categories ?? [])),
      intentFallbackToAgent: intentResult.fallbackToAgent,
      ragSkipped,
      matchedDocuments: matchedDocs.map((m) => ({ doc_id: m.doc_id, title: m.doc_title, similarity: m.similarity })),
      exactMatchChunkIds,
      hitCount: matchedDocs.length + exactMatchChunkIds.length,
      ...timings,
    }));
    return json({ conversationId: convoId, agentKey, reply, timings });
  } catch (e) {
    // AllProvidersFailedError traegt die vollstaendige Versuchsliste --
    // im Log steht damit, welcher Anbieter wann aus welchem Grund
    // gescheitert ist, nicht nur der letzte. Jeder einzelne Versuch wurde
    // bereits vom Router selbst protokolliert (ai-providers/router.ts);
    // diese Zeile ordnet den GESAMTAUSFALL dem Coach-Aufruf zu.
    if (e instanceof AllProvidersFailedError) {
      console.error(
        `coach-chat: alle Anbieter gescheitert, letzter Grund [${e.lastCode}]`,
        JSON.stringify(e.attempts),
      );
    } else {
      console.error('coach-chat error', e instanceof Error ? e.message : e);
    }

    // Antwort nach Grund unterscheiden. Vorher ging JEDER Fehler als
    // HTTP 500 mit demselben Text hinaus, auch ein Kontingentlimit.
    // Das war doppelt falsch: 500 bedeutet Serverfehler, ein 429 der
    // Gegenseite ist keiner, und "nicht erreichbar" stimmte nicht.
    //
    // Wiederholungen erfolgen bereits in gemini.ts: GEMINI_MAX_RETRIES = 2
    // mit exponentiellem Backoff fuer 408, 429, 500, 502, 503, 504.
    // Was hier ankommt, ist also ein Fehler NACH zwei Versuchen.
    //
    // Das Frontend liest das Feld `error` aus dem Rumpf (coachApi.ts)
    // und zeigt es unveraendert an. Der Text ist damit die Meldung,
    // die der Nutzer liest.
    // Fuenf Ursachencodes statt vorher sechs: 'refused' und
    // 'empty_response' waren Gemini-spezifische Sicherheitskonzepte
    // (Prompt- bzw. Antwortblockade), die es bei den drei neuen Anbietern
    // in dieser Form nicht gibt. Beide Faelle laufen jetzt unter
    // 'invalid_response' zusammen, mit einer Meldung, die beide Ursachen
    // deckt.
    //
    // Diese Meldung erscheint nur, wenn ALLE DREI Anbieter gescheitert
    // sind -- kein einzelner Ausfall mehr, sondern ein gleichzeitiger
    // Ausfall dreier unabhaengiger Anbieter. Entsprechend seltener als
    // zuvor, und der Text spiegelt das wider.
    const fehler: { status: number; text: string; retryAfter?: number } =
      e instanceof AllProvidersFailedError
        ? {
            rate_limited: {
              status: 429,
              text: 'Ascent ist gerade stark ausgelastet. Bitte in etwa einer Minute ' +
                    'noch einmal senden.',
              retryAfter: 60,
            },
            timeout: {
              status: 504,
              text: 'Ascent hat zu lange gebraucht. Bitte die Frage noch einmal senden, ' +
                    'gern etwas kuerzer.',
            },
            upstream: {
              status: 503,
              text: 'Ascent ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.',
            },
            invalid_response: {
              status: 502,
              text: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
            },
            missing_api_key: {
              status: 500,
              text: 'Ascent ist nicht vollstaendig konfiguriert. Bitte den Betreiber informieren.',
            },
          }[e.lastCode]
        : { status: 500, text: 'Der Coach ist gerade nicht erreichbar. Versuche es gleich noch einmal.' };

    const kopf: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (fehler.retryAfter) kopf['Retry-After'] = String(fehler.retryAfter);

    return new Response(JSON.stringify({ error: fehler.text }), {
      status: fehler.status,
      headers: kopf,
    });
  }
});
