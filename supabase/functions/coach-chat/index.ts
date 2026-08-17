// ============================================================
// coach-chat: Der eine Coach mit Spezialisten dahinter (ADR-011).
// Ablauf: Auth -> Limit -> Kontext laden (unter RLS des Nutzers!)
// -> Router -> Retrieval (pgvector) -> Antwort -> persistieren.
// Der Client schickt nur contactId + Nachricht; allen Kontext
// baut der Server selbst (Sprint-4-Prinzip: Kontext-first).
// ============================================================

import { corsHeaders, handleOptions, json } from '../_shared/cors.ts';
import { resolveActiveMembership, userClientFromRequest } from '../_shared/tenant.ts';
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
import { recordAiUsageEvent } from '../_shared/aiUsage.ts';
import {
  CORE_RULES,
  ROUTER_PROMPT,
  languageDirective,
  normalizeCoachLocale,
  type CoachLocale,
} from '../_shared/prompts.ts';
// Intent-Router, Sprint 3.1: pro-Nachricht-Klassifikation der
// Wissenskategorie, unabhaengig vom bestehenden Einmal-pro-Konversation-
// Router oben (ROUTER_PROMPT). Siehe intent-router/types.ts fuer die
// Abgrenzung der beiden Mechanismen.
import { classifyIntent } from '../_shared/intent-router/index.ts';
import { stripMarkdown } from '../_shared/format/strip-markdown.ts';

const PHASE_LABELS: Record<CoachLocale, Record<string, string>> = {
  de: {
    lead: 'Lead',
    im_gespraech: 'Im Gespräch',
    praesentation_offen: 'Präsentation gesendet',
    praesentation: 'Präsentation gesehen',
    fit_check: 'Fit Check abgeschlossen',
    three_way_call: '3-Way-Call durchgeführt',
    kunde: 'Kunde',
    partner: 'Partner',
  },
  tr: {
    lead: 'Potansiyel kişi',
    im_gespraech: 'Görüşme aşamasında',
    praesentation_offen: 'Sunum gönderildi',
    praesentation: 'Sunum görüntülendi',
    fit_check: 'Fit Check tamamlandı',
    three_way_call: '3-Way-Call yapıldı',
    kunde: 'Müşteri',
    partner: 'İş ortağı',
  },
  fr: {
    lead: 'Prospect',
    im_gespraech: 'En conversation',
    praesentation_offen: 'Présentation envoyée',
    praesentation: 'Présentation consultée',
    fit_check: 'Fit Check terminé',
    three_way_call: '3-Way-Call effectué',
    kunde: 'Client',
    partner: 'Partenaire',
  },
  en: {
    lead: 'Lead',
    im_gespraech: 'In conversation',
    praesentation_offen: 'Presentation sent',
    praesentation: 'Presentation viewed',
    fit_check: 'Fit Check completed',
    three_way_call: '3-Way Call completed',
    kunde: 'Customer',
    partner: 'Partner',
  },
  it: {
    lead: 'Contatto potenziale',
    im_gespraech: 'In conversazione',
    praesentation_offen: 'Presentazione inviata',
    praesentation: 'Presentazione visualizzata',
    fit_check: 'Fit Check completato',
    three_way_call: '3-Way-Call effettuata',
    kunde: 'Cliente',
    partner: 'Partner',
  },
  pl: {
    lead: 'Lead',
    im_gespraech: 'W rozmowie',
    praesentation_offen: 'Prezentacja wysłana',
    praesentation: 'Prezentacja obejrzana',
    fit_check: 'Fit Check ukończony',
    three_way_call: '3-Way-Call przeprowadzony',
    kunde: 'Klient',
    partner: 'Partner',
  },
};

const EVENT_LABELS: Record<CoachLocale, Record<string, string>> = {
  de: {
    contact_created: 'Kontakt erstellt',
    first_touch: 'Erstes Gespräch',
    follow_up: 'Follow-up',
    presentation_sent: 'Präsentation gesendet',
    presentation_viewed: 'Präsentation angesehen',
    fit_check_sent: 'Fit Check gesendet',
    fit_check_completed: 'Fit Check abgeschlossen',
    waytomoon_sent: 'Onboarding gesendet',
    three_way_call_done: '3-Way-Call durchgeführt',
    party_scheduled: 'Duftparty geplant',
    party_done: 'Duftparty durchgeführt',
    became_customer: 'Kunde geworden',
    registered: 'Als Partner registriert',
  },
  tr: {
    contact_created: 'Kişi oluşturuldu',
    first_touch: 'İlk görüşme',
    follow_up: 'Takip',
    presentation_sent: 'Sunum gönderildi',
    presentation_viewed: 'Sunum görüntülendi',
    fit_check_sent: 'Fit Check gönderildi',
    fit_check_completed: 'Fit Check tamamlandı',
    waytomoon_sent: 'Onboarding gönderildi',
    three_way_call_done: '3-Way-Call yapıldı',
    party_scheduled: 'Parfüm partisi planlandı',
    party_done: 'Parfüm partisi yapıldı',
    became_customer: 'Müşteri oldu',
    registered: 'İş ortağı olarak kaydoldu',
  },
  fr: {
    contact_created: 'Contact créé',
    first_touch: 'Premier échange',
    follow_up: 'Relance',
    presentation_sent: 'Présentation envoyée',
    presentation_viewed: 'Présentation consultée',
    fit_check_sent: 'Fit Check envoyé',
    fit_check_completed: 'Fit Check terminé',
    waytomoon_sent: 'Onboarding envoyé',
    three_way_call_done: '3-Way-Call effectué',
    party_scheduled: 'Soirée parfum planifiée',
    party_done: 'Soirée parfum réalisée',
    became_customer: 'Devenu client',
    registered: 'Inscrit comme partenaire',
  },
  en: {
    contact_created: 'Contact created',
    first_touch: 'First conversation',
    follow_up: 'Follow-up',
    presentation_sent: 'Presentation sent',
    presentation_viewed: 'Presentation viewed',
    fit_check_sent: 'Fit Check sent',
    fit_check_completed: 'Fit Check completed',
    waytomoon_sent: 'Onboarding sent',
    three_way_call_done: '3-Way Call completed',
    party_scheduled: 'Fragrance party scheduled',
    party_done: 'Fragrance party completed',
    became_customer: 'Became a customer',
    registered: 'Registered as a partner',
  },
  it: {
    contact_created: 'Contatto creato',
    first_touch: 'Prima conversazione',
    follow_up: 'Follow-up',
    presentation_sent: 'Presentazione inviata',
    presentation_viewed: 'Presentazione visualizzata',
    fit_check_sent: 'Fit Check inviato',
    fit_check_completed: 'Fit Check completato',
    waytomoon_sent: 'Onboarding inviato',
    three_way_call_done: '3-Way-Call effettuata',
    party_scheduled: 'Festa dei profumi pianificata',
    party_done: 'Festa dei profumi svolta',
    became_customer: 'È diventato cliente',
    registered: 'Registrato come partner',
  },
  pl: {
    contact_created: 'Kontakt utworzony',
    first_touch: 'Pierwsza rozmowa',
    follow_up: 'Follow-up',
    presentation_sent: 'Prezentacja wysłana',
    presentation_viewed: 'Prezentacja obejrzana',
    fit_check_sent: 'Fit Check wysłany',
    fit_check_completed: 'Fit Check ukończony',
    waytomoon_sent: 'Onboarding wysłany',
    three_way_call_done: '3-Way-Call przeprowadzony',
    party_scheduled: 'Impreza zapachowa zaplanowana',
    party_done: 'Impreza zapachowa przeprowadzona',
    became_customer: 'Został klientem',
    registered: 'Zarejestrowany jako partner',
  },
};

type LocalizedText = {
  errors: {
    notSignedIn: string;
    profileNotFound: string;
    dailyLimit: (limit: number) => string;
    emptyMessage: string;
    contactNotFound: string;
    conversationNotFound: string;
    coachNotConfigured: string;
    emptyReply: string;
    rateLimited: string;
    timeout: string;
    upstream: string;
    invalidResponse: string;
    missingApiKey: string;
    generic: string;
  };
  contact: {
    name: string;
    pipelinePhase: string;
    lastContact: string;
    never: string;
    today: string;
    daysAgo: (days: number) => string;
    plannedNextStep: string;
    notes: string;
    recentEvents: string;
    contextHeader: string;
  };
  knowledge: {
    ragSkippedHint: string;
    extractsHeader: string;
    documentFallback: string;
    exactMatchHeader: string;
    noDocumentsHint: string;
  };
};

const TEXT: Record<CoachLocale, LocalizedText> = {
  de: {
    errors: {
      notSignedIn: 'Nicht angemeldet.',
      profileNotFound: 'Kein Profil gefunden.',
      dailyLimit: (limit) =>
        `Tageslimit erreicht (${limit} Nachrichten). Morgen geht es weiter.`,
      emptyMessage: 'Leere Nachricht.',
      contactNotFound: 'Kontakt nicht gefunden.',
      conversationNotFound: 'Konversation nicht gefunden.',
      coachNotConfigured: 'Kein Coach konfiguriert.',
      emptyReply: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
      rateLimited:
        'Ascent ist gerade stark ausgelastet. Bitte in etwa einer Minute noch einmal senden.',
      timeout:
        'Ascent hat zu lange gebraucht. Bitte die Frage noch einmal senden, gern etwas kürzer.',
      upstream: 'Ascent ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.',
      invalidResponse: 'Ascent konnte keine Antwort erzeugen. Bitte noch einmal senden.',
      missingApiKey:
        'Ascent ist nicht vollständig konfiguriert. Bitte den Betreiber informieren.',
      generic: 'Der Coach ist gerade nicht erreichbar. Versuche es gleich noch einmal.',
    },
    contact: {
      name: 'Name',
      pipelinePhase: 'Pipeline-Phase',
      lastContact: 'Letzter Kontakt',
      never: 'noch nie',
      today: 'heute',
      daysAgo: (days) => `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`,
      plannedNextStep: 'Geplanter nächster Schritt',
      notes: 'Notizen',
      recentEvents: 'Letzte Ereignisse (neueste zuerst)',
      contextHeader: 'KONTAKT-KONTEXT (aus der Pipeline des Nutzers, bereits bekannt)',
    },
    knowledge: {
      ragSkippedHint:
        'HINWEIS: Diese Frage betrifft vermutlich eigene Kontakte oder den Tagesplan des Nutzers. ' +
        'Du hast dazu KEINEN direkten Datenzugriff in dieser Antwort, außer der KONTAKT-KONTEXT ' +
        'ist unten angegeben. Erfinde keine Kontakt- oder Aufgabendaten. Verweise bei Bedarf auf ' +
        'die Bereiche Kontakte bzw. Heute in der App.',
      extractsHeader: 'AUSZÜGE AUS DEN TEAMDOKUMENTEN (oberste Wahrheit)',
      documentFallback: 'Wissensdokument',
      exactMatchHeader: 'EXAKTER ZAHLENTREFFER (bevorzugt verwenden)',
      noDocumentsHint:
        'HINWEIS: Zu dieser Frage wurden KEINE Teamdokumente gefunden. Beachte die Wissensbasis-Regel.',
    },
  },
  tr: {
    errors: {
      notSignedIn: 'Oturum açılmadı.',
      profileNotFound: 'Profil bulunamadı.',
      dailyLimit: (limit) =>
        `Günlük sınıra ulaşıldı (${limit} mesaj). Yarın devam edebilirsin.`,
      emptyMessage: 'Mesaj boş.',
      contactNotFound: 'Kişi bulunamadı.',
      conversationNotFound: 'Konuşma bulunamadı.',
      coachNotConfigured: 'Yapılandırılmış bir koç yok.',
      emptyReply: 'Ascent bir yanıt oluşturamadı. Lütfen tekrar gönder.',
      rateLimited:
        'Ascent şu anda çok yoğun. Lütfen yaklaşık bir dakika sonra tekrar gönder.',
      timeout:
        'Ascent yanıt vermek için çok uzun süre bekledi. Lütfen soruyu biraz kısaltıp tekrar gönder.',
      upstream: 'Ascent şu anda kullanılamıyor. Lütfen biraz sonra tekrar dene.',
      invalidResponse: 'Ascent bir yanıt oluşturamadı. Lütfen tekrar gönder.',
      missingApiKey:
        'Ascent tam olarak yapılandırılmamış. Lütfen sistem yöneticisine bildir.',
      generic: 'Koç şu anda kullanılamıyor. Lütfen biraz sonra tekrar dene.',
    },
    contact: {
      name: 'Ad',
      pipelinePhase: 'Pipeline aşaması',
      lastContact: 'Son iletişim',
      never: 'henüz hiç',
      today: 'bugün',
      daysAgo: (days) => `${days} gün önce`,
      plannedNextStep: 'Planlanan sonraki adım',
      notes: 'Notlar',
      recentEvents: 'Son olaylar (en yeniden eskiye)',
      contextHeader: 'KİŞİ BAĞLAMI (kullanıcının pipeline verilerinden, zaten biliniyor)',
    },
    knowledge: {
      ragSkippedHint:
        'NOT: Bu soru muhtemelen kullanıcının kendi kişileri veya günlük planıyla ilgili. ' +
        'Aşağıda KİŞİ BAĞLAMI verilmedikçe bu yanıtta bu verilere doğrudan erişimin YOK. ' +
        'Kişi veya görev verileri uydurma. Gerekirse kullanıcıyı uygulamadaki Kişiler veya ' +
        'Bugün bölümlerine yönlendir.',
      extractsHeader: 'TAKIM BELGELERİNDEN ALINTILAR (en güvenilir kaynak)',
      documentFallback: 'Bilgi belgesi',
      exactMatchHeader: 'TAM SAYI EŞLEŞMESİ (öncelikli kullan)',
      noDocumentsHint:
        'NOT: Bu soru için HİÇBİR takım belgesi bulunamadı. Bilgi tabanı kuralına uy.',
    },
  },
  fr: {
    errors: {
      notSignedIn: 'Non connecté.',
      profileNotFound: 'Profil introuvable.',
      dailyLimit: (limit) =>
        `Limite quotidienne atteinte (${limit} messages). Tu pourras continuer demain.`,
      emptyMessage: 'Message vide.',
      contactNotFound: 'Contact introuvable.',
      conversationNotFound: 'Conversation introuvable.',
      coachNotConfigured: 'Aucun coach configuré.',
      emptyReply: "Ascent n'a pas pu générer de réponse. Merci de renvoyer ton message.",
      rateLimited:
        'Ascent est très sollicité en ce moment. Merci de réessayer dans environ une minute.',
      timeout:
        'Ascent a mis trop de temps à répondre. Merci de renvoyer une question un peu plus courte.',
      upstream: 'Ascent est indisponible pour le moment. Merci de réessayer bientôt.',
      invalidResponse:
        "Ascent n'a pas pu générer de réponse. Merci de renvoyer ton message.",
      missingApiKey:
        "Ascent n'est pas entièrement configuré. Merci d'en informer l'administrateur.",
      generic: 'Le coach est indisponible pour le moment. Réessaie bientôt.',
    },
    contact: {
      name: 'Nom',
      pipelinePhase: 'Phase du pipeline',
      lastContact: 'Dernier contact',
      never: 'jamais',
      today: "aujourd'hui",
      daysAgo: (days) => `il y a ${days} ${days === 1 ? 'jour' : 'jours'}`,
      plannedNextStep: 'Prochaine étape prévue',
      notes: 'Notes',
      recentEvents: 'Derniers événements (du plus récent au plus ancien)',
      contextHeader: "CONTEXTE DU CONTACT (issu du pipeline de l'utilisateur, déjà connu)",
    },
    knowledge: {
      ragSkippedHint:
        "REMARQUE : cette question concerne probablement les contacts ou le planning quotidien de l'utilisateur. " +
        "Tu n'as AUCUN accès direct à ces données dans cette réponse, sauf si un CONTEXTE DU CONTACT " +
        "est fourni ci-dessous. N'invente aucune donnée de contact ou de tâche. Si nécessaire, " +
        "renvoie l'utilisateur vers les sections Contacts ou Aujourd'hui de l'application.",
      extractsHeader: "EXTRAITS DES DOCUMENTS DE L'ÉQUIPE (source prioritaire)",
      documentFallback: 'Document de référence',
      exactMatchHeader: 'CORRESPONDANCE NUMÉRIQUE EXACTE (à utiliser en priorité)',
      noDocumentsHint:
        "REMARQUE : AUCUN document d'équipe n'a été trouvé pour cette question. Respecte la règle de la base de connaissances.",
    },
  },
  en: {
    errors: {
      notSignedIn: 'Not signed in.',
      profileNotFound: 'Profile not found.',
      dailyLimit: (limit) =>
        `Daily limit reached (${limit} messages). You can continue tomorrow.`,
      emptyMessage: 'Empty message.',
      contactNotFound: 'Contact not found.',
      conversationNotFound: 'Conversation not found.',
      coachNotConfigured: 'No coach is configured.',
      emptyReply: 'Ascent could not generate a response. Please send your message again.',
      rateLimited:
        'Ascent is under heavy load right now. Please send your message again in about a minute.',
      timeout:
        'Ascent took too long to respond. Please send the question again, preferably a little shorter.',
      upstream: 'Ascent is unavailable right now. Please try again shortly.',
      invalidResponse: 'Ascent could not generate a response. Please send your message again.',
      missingApiKey:
        'Ascent is not fully configured. Please inform the administrator.',
      generic: 'The coach is unavailable right now. Please try again shortly.',
    },
    contact: {
      name: 'Name',
      pipelinePhase: 'Pipeline phase',
      lastContact: 'Last contact',
      never: 'never',
      today: 'today',
      daysAgo: (days) => `${days} ${days === 1 ? 'day' : 'days'} ago`,
      plannedNextStep: 'Planned next step',
      notes: 'Notes',
      recentEvents: 'Recent events (newest first)',
      contextHeader: "CONTACT CONTEXT (from the user's pipeline, already known)",
    },
    knowledge: {
      ragSkippedHint:
        "NOTE: This question probably concerns the user's own contacts or daily plan. You have " +
        'NO direct access to that data in this response unless CONTACT CONTEXT is provided below. ' +
        'Do not invent contact or task data. If needed, direct the user to the Contacts or Today ' +
        'sections in the app.',
      extractsHeader: 'EXCERPTS FROM TEAM DOCUMENTS (highest-priority source)',
      documentFallback: 'Knowledge document',
      exactMatchHeader: 'EXACT NUMBER MATCH (use first)',
      noDocumentsHint:
        'NOTE: NO team documents were found for this question. Follow the knowledge-base rule.',
    },
  },
  it: {
    errors: {
      notSignedIn: 'Accesso non effettuato.',
      profileNotFound: 'Profilo non trovato.',
      dailyLimit: (limit) =>
        `Limite giornaliero raggiunto (${limit} messaggi). Potrai continuare domani.`,
      emptyMessage: 'Messaggio vuoto.',
      contactNotFound: 'Contatto non trovato.',
      conversationNotFound: 'Conversazione non trovata.',
      coachNotConfigured: 'Nessun coach configurato.',
      emptyReply: 'Ascent non è riuscito a generare una risposta. Invia di nuovo il messaggio.',
      rateLimited:
        'Ascent è molto occupato in questo momento. Invia di nuovo il messaggio tra circa un minuto.',
      timeout:
        'Ascent ha impiegato troppo tempo. Invia di nuovo la domanda, possibilmente un po’ più breve.',
      upstream: 'Ascent non è disponibile al momento. Riprova tra poco.',
      invalidResponse:
        'Ascent non è riuscito a generare una risposta. Invia di nuovo il messaggio.',
      missingApiKey:
        "Ascent non è configurato completamente. Informa l'amministratore.",
      generic: 'Il coach non è disponibile al momento. Riprova tra poco.',
    },
    contact: {
      name: 'Nome',
      pipelinePhase: 'Fase della pipeline',
      lastContact: 'Ultimo contatto',
      never: 'mai',
      today: 'oggi',
      daysAgo: (days) => `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`,
      plannedNextStep: 'Prossimo passo pianificato',
      notes: 'Note',
      recentEvents: 'Eventi recenti (dal più recente)',
      contextHeader: "CONTESTO DEL CONTATTO (dalla pipeline dell'utente, già noto)",
    },
    knowledge: {
      ragSkippedHint:
        "NOTA: questa domanda riguarda probabilmente i contatti o il piano giornaliero dell'utente. " +
        'NON hai accesso diretto a questi dati in questa risposta, a meno che non sia indicato qui ' +
        'sotto un CONTESTO DEL CONTATTO. Non inventare dati su contatti o attività. Se necessario, ' +
        "rimanda l'utente alle sezioni Contatti o Oggi dell'app.",
      extractsHeader: 'ESTRATTI DAI DOCUMENTI DEL TEAM (fonte prioritaria)',
      documentFallback: 'Documento informativo',
      exactMatchHeader: 'CORRISPONDENZA NUMERICA ESATTA (da usare per prima)',
      noDocumentsHint:
        'NOTA: non è stato trovato ALCUN documento del team per questa domanda. Segui la regola della base di conoscenza.',
    },
  },
  pl: {
    errors: {
      notSignedIn: 'Nie zalogowano.',
      profileNotFound: 'Nie znaleziono profilu.',
      dailyLimit: (limit) =>
        `Osiągnięto dzienny limit (${limit} wiadomości). Możesz kontynuować jutro.`,
      emptyMessage: 'Pusta wiadomość.',
      contactNotFound: 'Nie znaleziono kontaktu.',
      conversationNotFound: 'Nie znaleziono rozmowy.',
      coachNotConfigured: 'Brak skonfigurowanego coacha.',
      emptyReply: 'Ascent nie mógł wygenerować odpowiedzi. Wyślij wiadomość ponownie.',
      rateLimited:
        'Ascent jest teraz mocno obciążony. Wyślij wiadomość ponownie za około minutę.',
      timeout:
        'Ascent potrzebował zbyt dużo czasu. Wyślij pytanie ponownie, najlepiej nieco krótsze.',
      upstream: 'Ascent jest teraz niedostępny. Spróbuj ponownie za chwilę.',
      invalidResponse: 'Ascent nie mógł wygenerować odpowiedzi. Wyślij wiadomość ponownie.',
      missingApiKey:
        'Ascent nie jest w pełni skonfigurowany. Poinformuj administratora.',
      generic: 'Coach jest teraz niedostępny. Spróbuj ponownie za chwilę.',
    },
    contact: {
      name: 'Imię',
      pipelinePhase: 'Etap pipeline',
      lastContact: 'Ostatni kontakt',
      never: 'nigdy',
      today: 'dzisiaj',
      daysAgo: (days) =>
        days === 1 ? '1 dzień temu' : `${days} dni temu`,
      plannedNextStep: 'Zaplanowany następny krok',
      notes: 'Notatki',
      recentEvents: 'Ostatnie wydarzenia (od najnowszych)',
      contextHeader: 'KONTEKST KONTAKTU (z pipeline użytkownika, już znany)',
    },
    knowledge: {
      ragSkippedHint:
        'UWAGA: To pytanie dotyczy prawdopodobnie kontaktów lub planu dnia użytkownika. ' +
        'NIE masz bezpośredniego dostępu do tych danych w tej odpowiedzi, chyba że poniżej ' +
        'podano KONTEKST KONTAKTU. Nie wymyślaj danych kontaktów ani zadań. W razie potrzeby ' +
        'odeslij użytkownika do sekcji Kontakty lub Dzisiaj w aplikacji.',
      extractsHeader: 'FRAGMENTY Z DOKUMENTÓW ZESPOŁU (najwyższy priorytet)',
      documentFallback: 'Dokument wiedzy',
      exactMatchHeader: 'DOKŁADNE DOPASOWANIE LICZBY (użyj w pierwszej kolejności)',
      noDocumentsHint:
        'UWAGA: Nie znaleziono ŻADNYCH dokumentów zespołu dla tego pytania. Stosuj regułę bazy wiedzy.',
    },
  },
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (key: string, since: number) => { timings[key] = Date.now() - since; };
  let locale: CoachLocale = 'de';
  try {
    // Read locale from a clone so auth/limit ordering and the later body
    // parsing stay unchanged. Missing, malformed, or unsupported values use DE.
    const localeBody: unknown = await req.clone().json().catch(() => ({}));
    locale = normalizeCoachLocale(
      localeBody && typeof localeBody === 'object'
        ? (localeBody as Record<string, unknown>).locale
        : undefined,
    );
    const text = TEXT[locale];
    const phaseLabels = PHASE_LABELS[locale];
    const eventLabels = EVENT_LABELS[locale];

    // User-Client: JWT + x-ascendos-org forwarded so RLS/current_org_id() work.
    // Org authority = validated membership (Phase 5), never profiles.org_id alone.
    const db = userClientFromRequest(req);
    const resolved = await resolveActiveMembership(db, req);
    if (!resolved.ok) {
      if (resolved.status === 401) return json({ error: text.errors.notSignedIn }, 401);
      return json({ error: text.errors.profileNotFound }, 403);
    }
    const userId = resolved.userId;
    const activeOrgId = resolved.membership.org_id;
    const activeRole = resolved.membership.role;

    const { data: profile } = await db.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return json({ error: text.errors.profileNotFound }, 403);

    // Kostenkontrolle: Tageslimit aus den Org-Einstellungen (ADR-007).
    const { data: org } = await db
      .from('organizations')
      .select('settings')
      .eq('id', activeOrgId)
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
        error: text.errors.dailyLimit(dailyLimit),
      }, 429);
    }

    const body = await req.json();
    const message = String(body.message ?? '').trim();
    const contactId = body.contactId ? String(body.contactId) : null;
    let convoId = body.conversationId ? String(body.conversationId) : null;
    if (!message) return json({ error: text.errors.emptyMessage }, 400);

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
      if (!contact.data) return json({ error: text.errors.contactNotFound }, 404);

      const days = phase.data?.last_event_at
        ? Math.floor((Date.now() - new Date(phase.data.last_event_at).getTime()) / 86_400_000)
        : null;
      // Explizit typisiert: unter `strict` ist ein impliziter any hier ein
      // Fehler (blockiert `deno check`), und der Coach-Kontext darf nie ein
      // rohes "undefined" enthalten.
      const eventRows = (events.data ?? []) as Array<{ event_type: string; occurred_at: string }>;
      const phaseKey: string = phase.data?.phase ?? 'lead';

      const lines = [
        `${text.contact.name}: ${contact.data.name}`,
        `${text.contact.pipelinePhase}: ${phaseLabels[phaseKey] ?? phaseKey}`,
        `${text.contact.lastContact}: ${
          days === null ? text.contact.never : days === 0 ? text.contact.today : text.contact.daysAgo(days)
        }`,
        contact.data.next_step
          ? `${text.contact.plannedNextStep}: ${contact.data.next_step}`
          : null,
        contact.data.notes ? `${text.contact.notes}: ${contact.data.notes}` : null,
        `${text.contact.recentEvents}:`,
        ...eventRows.map(
          (e) =>
            `- ${eventLabels[e.event_type] ?? e.event_type} (${String(e.occurred_at).slice(0, 10)})`
        ),
      ].filter(Boolean);
      contactContext = `${text.contact.contextHeader}:\n${lines.join('\n')}`;
    }

    mark('context_ms', tContext);

    // ---------- Konversation laden/anlegen ----------
    // Stale conversationId (e.g. after demo wipe) must never surface as a user-facing
    // "Konversation nicht gefunden" — silently start a fresh thread instead.
    let history: ChatMessage[] = [];
    let agentKey: string | null = null;
    if (convoId) {
      // Phase 6: conversation history must belong to the active org.
      // Never load Org B messages into an Org A prompt (multi-org users).
      const { data: convo } = await db.from('coach_convos')
        .select('*')
        .eq('id', convoId)
        .eq('org_id', activeOrgId)
        .single();
      if (convo) {
        agentKey = convo.agent_key;
        const { data: msgs } = await db.from('coach_messages')
          .select('role, content').eq('convo_id', convoId)
          .order('created_at').limit(30);
        history = (msgs ?? []) as ChatMessage[];
      } else {
        convoId = null;
      }
    }
    if (!convoId) {
      const { data: convo, error } = await db.from('coach_convos')
        .insert({ user_id: userId, org_id: activeOrgId, contact_id: contactId })
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
      .select('*').eq('org_id', activeOrgId).eq('key', agentKey).single();
    if (!agent) return json({ error: text.errors.coachNotConfigured }, 500);

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
      knowledgeBlock = text.knowledge.ragSkippedHint;
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
        p_org_id: activeOrgId,
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
          `${text.knowledge.extractsHeader}:\n` +
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
            .eq('org_id', activeOrgId)
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
                  `[${titelNachId.get(c.doc_id) ?? text.knowledge.documentFallback}]\n${c.content}`,
              ).join('\n---\n');
              // Exakter Treffer zuerst: eine konkrete Ziffer ist eine
              // staerkere Aussage als semantische Naehe.
              knowledgeBlock = knowledgeBlock
                ? `${text.knowledge.exactMatchHeader}:\n${exactBlock}\n\n${knowledgeBlock}`
                : `${text.knowledge.exactMatchHeader}:\n${exactBlock}`;
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
            org_id: activeOrgId, user_id: userId, agent_key: agentKey, question: topic,
          });
        }
      } catch (_e) {
        // bewusst kein Fallback auf die Rohfrage
      }
    }

    mark('rag_ms', tRag);

    // ---------- Antwort ----------
    // Gesprächskontinuität: History ist bereits in messages — zusätzlich
    // ein klarer Mentor-Hinweis, damit das Modell nicht "neu startet".
    const continuity =
      history.length > 0
        ? [
            'GESPRÄCHSKONTINUITÄT:',
            `Du sprichst weiter mit ${profile.first_name}. Es gibt bereits einen Verlauf.`,
            'Baue darauf auf. Wiederhole keine abgeschlossenen Punkte.',
            'Beziehe dich natürlich auf frühere Aussagen, wenn sie relevant sind.',
            'Starte nicht bei null — du bist mitten in einem Mentor-Gespräch.',
          ].join('\n')
        : null;

    const system = [
      CORE_RULES,
      `DEINE SPEZIALISIERUNG:\n${agent.system_prompt}`,
      `NUTZER: ${profile.first_name} (Rolle: ${activeRole}).`,
      continuity,
      contactContext || null,
      knowledgeBlock ||
        text.knowledge.noDocumentsHint,
      // Last block wins over German CORE_RULES, agent prompts, multilingual
      // history, contact notes, and source documents.
      languageDirective(locale),
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
      return json({ error: text.errors.emptyReply }, 502);
    }

    await db.from('coach_messages').insert([
      { convo_id: convoId, role: 'user', content: message },
      { convo_id: convoId, role: 'assistant', content: reply },
    ]);
    await db.from('usage_events').insert({
      user_id: userId, org_id: activeOrgId, event_type: 'coach_message_sent',
      metadata: { agent_key: agentKey, had_knowledge: hadKnowledge },
    }).then(() => {}, () => {}); // Tracking bricht nie den Coach

    await recordAiUsageEvent(db, {
      org_id: activeOrgId,
      user_id: userId,
      feature: 'coach-chat',
      provider: chatResult.provider,
      model: chatResult.model,
      input_tokens: chatResult.usage?.inputTokens ?? 0,
      output_tokens: chatResult.usage?.outputTokens ?? 0,
      metadata: { agent_key: agentKey, had_knowledge: hadKnowledge },
    });

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
    const text = TEXT[locale];
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
              text: text.errors.rateLimited,
              retryAfter: 60,
            },
            timeout: {
              status: 504,
              text: text.errors.timeout,
            },
            upstream: {
              status: 503,
              text: text.errors.upstream,
            },
            invalid_response: {
              status: 502,
              text: text.errors.invalidResponse,
            },
            missing_api_key: {
              status: 500,
              text: text.errors.missingApiKey,
            },
          }[e.lastCode]
        : { status: 500, text: text.errors.generic };

    const kopf: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (fehler.retryAfter) kopf['Retry-After'] = String(fehler.retryAfter);

    return new Response(JSON.stringify({ error: fehler.text }), {
      status: fehler.status,
      headers: kopf,
    });
  }
});
