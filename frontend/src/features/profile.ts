import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type UpdateProfileRequest } from '@/api';
import { queryKeys } from './queryKeys';

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => api.profile.update(body),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: () => api.profile.deleteAccount() });
}
