import { useMutation } from "@tanstack/react-query";
import { orpc } from "../lib/api";
export function useResolveTaobao() {
  return useMutation(orpc.taobao.resolve.mutationOptions());
}
