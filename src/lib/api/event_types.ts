import { supabase } from '$lib/supabase';
import type { EventType } from '$lib/types';

export const eventTypesApi = {
    async getAll() {
        // Order by day of week then logic start time
        const { data, error } = await supabase
            .from('event_types')
            .select('*')
            .order('day_of_week', { ascending: true })
            .order('start_time', { ascending: true });
        
        if (error) throw error;
        return data as EventType[];
    },

    async create(eventType: Partial<EventType>) {
        const { data, error } = await supabase
            .from('event_types')
            .insert(eventType)
            .select()
            .single();
        
        if (error) throw error;
        return data as EventType;
    },

    async update(id: number, updates: Partial<EventType>) {
        const { data, error } = await supabase
            .from('event_types')
            .update(updates)
            .eq('event_type_id', id)
            .select()
            .single();
        
        if (error) throw error;
        return data as EventType;
    },

    async delete(id: number) {
        const { error } = await supabase
            .from('event_types')
            .delete()
            .eq('event_type_id', id);
        
        if (error) throw error;
    },

    async generateEvents(startDate: string, endDate: string) {
        const { data, error } = await supabase
            .rpc('generate_recurring_events', {
                start_date: startDate,
                end_date: endDate
            });
        
        if (error) throw error;
        return data as number; // returns count of events created
    }
};
