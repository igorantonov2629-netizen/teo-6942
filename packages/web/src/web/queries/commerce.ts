import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export function useCities(query: string) {
  return useQuery(
    orpc.commerce.cities.queryOptions({
      input: { query },
      staleTime: Infinity,
    }),
  );
}
export function useCommerceSettings(enabled: boolean) {
  return useQuery(
    orpc.commerce.settings.queryOptions({ enabled, retry: false }),
  );
}
export function useSaveCommerceSettings() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.saveSettings.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useDestination() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.destination.mutationOptions({
      onSuccess: () =>
        q.invalidateQueries({ queryKey: orpc.teo.profile.key() }),
    }),
  );
}
export function useIssuePayment() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.issue.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useReportPayment() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.report.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useApprovePayment() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.approve.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useAdvanceOrder() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.advance.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useCancelUnpaidOrder() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.cancelUnpaid.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useProposeAvailability() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.propose.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useRespondAvailability() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.respond.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useAddArrivalPhotos() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.addPhotos.mutationOptions({
      onSuccess: () => q.invalidateQueries(),
    }),
  );
}
export function useSaveFullName() {
  const q = useQueryClient();
  return useMutation(
    orpc.commerce.fullName.mutationOptions({
      onSuccess: () =>
        q.invalidateQueries({ queryKey: orpc.teo.profile.key() }),
    }),
  );
}
