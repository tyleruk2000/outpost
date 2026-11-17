/**
 * What the tools section of Settings reads and changes on the server: `GET /api/tools`, and
 * the one switch that is not an ordinary setting, `PUT /api/tools/mcp`.
 *
 * Kept under "answers" so that a change of settings (the live event `settings.changed`,
 * which the `/mcp` switch publishes too) asks again, as it does for the answers section.
 */
import type { ToolsStatus } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const toolsKeys = { status: ["answers", "tools"] as const };

export function useToolsStatus() {
  return useQuery({ queryKey: toolsKeys.status, queryFn: () => api.get<ToolsStatus>("/api/tools") });
}

/** "Let other programs on the home network use these tools": only from the computer Outpost runs on. */
export function useSetMcp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.put<ToolsStatus>("/api/tools/mcp", { enabled }),
    onSuccess: (status) => client.setQueryData(toolsKeys.status, status),
  });
}
