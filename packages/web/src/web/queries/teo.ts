import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export const telegramInit = () =>
  (window as unknown as { Telegram?: { WebApp?: { initData?: string } } })
    .Telegram?.WebApp?.initData || "";
export function useTeoCatalog() {
  return useQuery(orpc.teo.catalog.queryOptions({ staleTime: 30000 }));
}
export function useTeoProfile() {
  return useQuery(
    orpc.teo.profile.queryOptions({
      enabled: !!telegramInit(),
      refetchOnWindowFocus: true,
      refetchInterval: 30000,
      retry: false,
    }),
  );
}
export function useTeoOrders(enabled: boolean) {
  return useQuery(
    orpc.teo.orders.queryOptions({
      enabled,
      refetchInterval: 30000,
      retry: false,
    }),
  );
}
export function useTeoRequests(enabled: boolean) {
  return useQuery(
    orpc.teo.requests.queryOptions({
      enabled,
      refetchInterval: 30000,
      retry: false,
    }),
  );
}
export function useTeoAdmin(enabled: boolean) {
  return useQuery(
    orpc.teo.admin.queryOptions({
      enabled,
      refetchInterval: 30000,
      retry: false,
    }),
  );
}
export function useCreateOrder() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.createOrder.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useCreateRequest() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.createRequest.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useSaveProduct() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.saveProduct.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useHideProduct() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.hideProduct.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useSetRequest() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.setRequest.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useTeoPoint() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.point.mutationOptions({
      onSuccess: () =>
        q.invalidateQueries({ queryKey: orpc.teo.profile.key() }),
    }),
  );
}
export function useRetryNotifications() {
  return useMutation(orpc.teo.retryNotifications.mutationOptions());
}
export function usePhotoAction() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.photoAction.mutationOptions({
      onSuccess: () => q.invalidateQueries({ queryKey: orpc.teo.key() }),
    }),
  );
}
export function useTeoReviews(productId: number) {
  return useQuery(orpc.teo.reviews.queryOptions({ input: { productId } }));
}
export function useAddReview() {
  const q = useQueryClient();
  return useMutation(
    orpc.teo.addReview.mutationOptions({
      onSuccess: () =>
        q.invalidateQueries({ queryKey: orpc.teo.reviews.key() }),
    }),
  );
}
