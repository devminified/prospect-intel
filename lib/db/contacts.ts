import { supabaseAdmin } from '@/lib/supabase/server'
import type { Contact } from '@/lib/types'

export async function listByProspect(prospectId: string): Promise<Contact[]> {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select(
      'id, prospect_id, full_name, first_name, last_name, title, seniority, department, email, email_confidence, phone, phone_source, phone_revealed_at, phone_request_id, linkedin_url, apollo_person_id, is_primary'
    )
    .eq('prospect_id', prospectId)
  if (error) throw new Error(`db.contacts.listByProspect: ${error.message}`)
  return (data as Contact[] | null) ?? []
}

export async function getById(contactId: string): Promise<Contact | null> {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select(
      'id, prospect_id, full_name, first_name, last_name, title, seniority, department, email, email_confidence, phone, phone_source, phone_revealed_at, phone_request_id, linkedin_url, apollo_person_id, is_primary'
    )
    .eq('id', contactId)
    .maybeSingle()
  if (error) throw new Error(`db.contacts.getById: ${error.message}`)
  return (data as Contact | null) ?? null
}

export async function findOwnership(contactId: string): Promise<{ prospect_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .select('prospect_id')
    .eq('id', contactId)
    .maybeSingle()
  if (error) throw new Error(`db.contacts.findOwnership: ${error.message}`)
  return (data as { prospect_id: string } | null) ?? null
}

export async function update(
  contactId: string,
  patch: Partial<Pick<Contact, 'linkedin_url' | 'first_name' | 'last_name' | 'full_name' | 'phone' | 'phone_source' | 'phone_revealed_at'>>
): Promise<void> {
  const { error } = await supabaseAdmin.from('contacts').update(patch).eq('id', contactId)
  if (error) throw new Error(`db.contacts.update: ${error.message}`)
}
