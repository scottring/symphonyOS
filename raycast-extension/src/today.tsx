import { Action, ActionPanel, Icon, Color, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { getAuthenticatedClient } from "./lib/supabase";

const APP_URL = "https://symphonyos.app";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  context: string | null;
  project: { name: string } | null;
  notes: string | null;
}

export default function TodayView() {
  const today = new Date().toISOString().split("T")[0];

  const { isLoading, data, revalidate, mutate } = useCachedPromise(async () => {
    const { client, userId } = await getAuthenticatedClient();
    const { data: tasks, error } = await client
      .from("tasks")
      .select("id, title, completed, context, notes, project:projects(name)")
      .eq("user_id", userId)
      .eq("scheduled_for", today)
      .order("completed", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (tasks as unknown as Task[]) ?? [];
  });

  const incomplete = data?.filter((t) => !t.completed) ?? [];
  const completed = data?.filter((t) => t.completed) ?? [];

  async function toggleComplete(task: Task) {
    const newState = !task.completed;
    const toast = await showToast({ style: Toast.Style.Animated, title: newState ? "Completing..." : "Reopening..." });
    try {
      await mutate(
        getAuthenticatedClient().then(({ client }) =>
          client.from("tasks").update({ completed: newState }).eq("id", task.id),
        ),
        {
          optimisticUpdate(currentData) {
            return currentData?.map((t) => (t.id === task.id ? { ...t, completed: newState } : t));
          },
        },
      );
      toast.style = Toast.Style.Success;
      toast.title = newState ? "Done!" : "Reopened";
    } catch {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to update";
      revalidate();
    }
  }

  const contextColor = (ctx: string | null): Color => {
    switch (ctx) {
      case "work":
        return Color.Blue;
      case "family":
        return Color.Green;
      case "personal":
        return Color.Purple;
      default:
        return Color.SecondaryText;
    }
  };

  return (
    <List isLoading={isLoading} navigationTitle={`Today — ${today}`}>
      {incomplete.length === 0 && completed.length === 0 && !isLoading && (
        <List.EmptyView icon={Icon.Calendar} title="Nothing scheduled" description="No tasks for today" />
      )}

      {incomplete.length > 0 && (
        <List.Section title="To Do" subtitle={`${incomplete.length}`}>
          {incomplete.map((task) => (
            <List.Item
              key={task.id}
              icon={Icon.Circle}
              title={task.title}
              subtitle={task.project?.name ?? ""}
              accessories={[
                task.context ? { tag: { value: task.context, color: contextColor(task.context) } } : {},
                task.notes ? { icon: Icon.Document, tooltip: "Has notes" } : {},
              ]}
              actions={
                <ActionPanel>
                  <Action title="Complete" icon={Icon.Checkmark} onAction={() => toggleComplete(task)} />
                  <Action.OpenInBrowser title="Open in Symphony" url={APP_URL} />
                  <Action.CopyToClipboard title="Copy Title" content={task.title} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {completed.length > 0 && (
        <List.Section title="Completed" subtitle={`${completed.length}`}>
          {completed.map((task) => (
            <List.Item
              key={task.id}
              icon={{ source: Icon.Checkmark, tintColor: Color.Green }}
              title={task.title}
              subtitle={task.project?.name ?? ""}
              actions={
                <ActionPanel>
                  <Action title="Reopen" icon={Icon.Circle} onAction={() => toggleComplete(task)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
