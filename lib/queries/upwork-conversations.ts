'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import type {
  UpworkConversation,
  UpworkConversationCreateInput,
  UpworkConversationDetail,
  UpworkConversationUpdateInput,
  UpworkMessage,
  UpworkMessageAppendInput,
} from '@/lib/types'
import { queryKeys } from './keys'

export function useConversations(profileId: string, status: string | null = null) {
  return useQuery<UpworkConversation[]>({
    queryKey: queryKeys.upwork.conversations(profileId, status),
    enabled: !!profileId,
    queryFn: () => {
      const qs = status && status !== 'any' ? `?status=${encodeURIComponent(status)}` : ''
      return apiGet<UpworkConversation[]>(
        `/api/upwork/profiles/${profileId}/conversations${qs}`
      )
    },
  })
}

export function useConversation(conversationId: string) {
  return useQuery<UpworkConversationDetail>({
    queryKey: queryKeys.upwork.conversation(conversationId),
    enabled: !!conversationId,
    queryFn: () =>
      apiGet<UpworkConversationDetail>(`/api/upwork/conversations/${conversationId}`),
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation<UpworkConversation, Error, UpworkConversationCreateInput>({
    mutationFn: (input) => apiPost<UpworkConversation>('/api/upwork/conversations', input),
    onSuccess: (conv) => {
      void qc.invalidateQueries({
        queryKey: ['upwork', 'profile', conv.profile_id, 'conversations'],
      })
    },
  })
}

export function useUpdateConversation(conversationId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, UpworkConversationUpdateInput>({
    mutationFn: (input) => apiPatch(`/api/upwork/conversations/${conversationId}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.conversation(conversationId) })
      void qc.invalidateQueries({
        queryKey: ['upwork', 'profile', profileId, 'conversations'],
      })
    },
  })
}

export function useAppendMessage(conversationId: string, profileId: string) {
  const qc = useQueryClient()
  return useMutation<UpworkMessage, Error, UpworkMessageAppendInput>({
    mutationFn: (input) =>
      apiPost<UpworkMessage>(`/api/upwork/conversations/${conversationId}/messages`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.upwork.conversation(conversationId) })
      void qc.invalidateQueries({
        queryKey: ['upwork', 'profile', profileId, 'conversations'],
      })
    },
  })
}
