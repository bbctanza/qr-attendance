import { supabase } from '$lib/supabase';
import type { Member } from '$lib/types';

export const membersApi = {
	/**
	 * Fetch all members with their group details
	 */
	async getAll() {
		const { data, error } = await supabase
			.from('members')
			.select(`
        *,
        groups (
          group_code,
          name
        )
      `)
			.order('last_name', { ascending: true });

		if (error) throw error;
		return data as Member[];
	},

	/**
	 * Get a single member by ID
	 */
	async getById(memberId: string) {
		const { data, error } = await supabase
			.from('members')
			.select(`
        *,
        groups (
          group_code,
          name
        )
      `)
			.eq('member_id', memberId)
			.single();

		if (error) throw error;
		return data as Member;
	},

	/**
	 * Upsert (Create or Update) a member
	 */
	async upsert(member: Partial<Member>) {
		// Remove joined grous data if present to avoid errors on insert
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { groups, created_at, ...dbData } = member;

		const { data, error } = await supabase
			.from('members')
			.upsert(dbData)
			.select()
			.single();

		if (error) throw error;
		return data as Member;
	},

	/**
	 * Delete a member
	 */
	async delete(memberId: string) {
		const { error } = await supabase.from('members').delete().eq('member_id', memberId);

		if (error) throw error;
		return true;
	}
};
