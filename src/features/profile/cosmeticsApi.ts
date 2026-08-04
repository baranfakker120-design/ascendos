import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@shared/api/supabase';
import { useAuth } from '@shared/auth/AuthProvider';

export type FrameCosmetic = {
  itemId: string;
  assetPath: string;
  label: string;
  rankKey: string | null;
  isEquipped: boolean;
  unlockedAt: string;
};

type FrameCosmeticRow = {
  item_id: string;
  asset_path: string;
  label: string;
  rank_key: string | null;
  is_equipped: boolean;
  unlocked_at: string;
};

function mapRow(row: FrameCosmeticRow): FrameCosmetic {
  return {
    itemId: row.item_id,
    assetPath: row.asset_path,
    label: row.label,
    rankKey: row.rank_key,
    isEquipped: row.is_equipped,
    unlockedAt: row.unlocked_at,
  };
}

/** Unlocked frame cosmetics for the active membership (includes role specials). */
export function useMyFrameCosmetics(enabled = true) {
  const { membership } = useAuth();
  return useQuery({
    queryKey: ['frame-cosmetics', membership?.id],
    enabled: enabled && !!membership?.id,
    queryFn: async (): Promise<FrameCosmetic[]> => {
      const { data, error } = await supabase.rpc('list_my_frame_cosmetics');
      if (error) throw error;
      return ((data ?? []) as FrameCosmeticRow[]).map(mapRow);
    },
  });
}

export function useEquipFrameCosmetic() {
  const { membership } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc('equip_frame_cosmetic', { p_item_id: itemId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['frame-cosmetics', membership?.id] });
      await queryClient.invalidateQueries({ queryKey: ['profile-detail'] });
    },
  });
}

export function equippedFrameKey(frames: FrameCosmetic[] | undefined): string | null {
  const equipped = frames?.find((f) => f.isEquipped);
  return equipped?.assetPath ?? null;
}
