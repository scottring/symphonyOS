import { Action, ActionPanel, Icon, Color, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { getAuthenticatedClient } from "./lib/supabase";

const APP_URL = "https://symphonyos.app";

interface Task {
  id: string;
  title: string;
  completed: boolean;
  context: string | null;
  scheduled_for: string | null;
  project: { name: string } | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
}

interface Contact {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
}

interface Routine {
  id: string;
  name: string;
  time_of_day: string | null;
  is_active: boolean;
}

type EntityType = "task" | "project" | "contact" | "routine";

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

export default function Search() {
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { isLoading, data } = useCachedPromise(
    async (search: string, filter: string) => {
      if (!search || search.length < 2) return { tasks: [], projects: [], contacts: [], routines: [] };

      const { client, userId } = await getAuthenticatedClient();
      const q = `%${search}%`;

      const [tasksRes, projectsRes, contactsRes, routinesRes] = await Promise.all([
        filter === "all" || filter === "task"
          ? client
              .from("tasks")
              .select("id, title, completed, context, scheduled_for, project:projects(name)")
              .eq("user_id", userId)
              .ilike("title", q)
              .order("completed", { ascending: true })
              .limit(10)
          : Promise.resolve({ data: [] }),
        filter === "all" || filter === "project"
          ? client.from("projects").select("id, name, status").eq("user_id", userId).ilike("name", q).limit(10)
          : Promise.resolve({ data: [] }),
        filter === "all" || filter === "contact"
          ? client
              .from("contacts")
              .select("id, name, category, phone, email")
              .eq("user_id", userId)
              .ilike("name", q)
              .limit(10)
          : Promise.resolve({ data: [] }),
        filter === "all" || filter === "routine"
          ? client
              .from("routines")
              .select("id, name, time_of_day, is_active")
              .eq("user_id", userId)
              .ilike("name", q)
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        tasks: (tasksRes.data as unknown as Task[]) ?? [],
        projects: (projectsRes.data as unknown as Project[]) ?? [],
        contacts: (contactsRes.data as unknown as Contact[]) ?? [],
        routines: (routinesRes.data as unknown as Routine[]) ?? [],
      };
    },
    [searchText, typeFilter],
    { keepPreviousData: true },
  );

  const openUrl = (type: EntityType, id: string) => {
    const paths: Record<EntityType, string> = {
      task: "/",
      project: `/projects/${id}`,
      contact: `/contacts/${id}`,
      routine: `/routines/${id}`,
    };
    return `${APP_URL}${paths[type]}`;
  };

  return (
    <List
      isLoading={isLoading}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search tasks, projects, contacts, routines..."
      throttle
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by type" onChange={setTypeFilter}>
          <List.Dropdown.Item title="All" value="all" />
          <List.Dropdown.Item title="Tasks" value="task" />
          <List.Dropdown.Item title="Projects" value="project" />
          <List.Dropdown.Item title="Contacts" value="contact" />
          <List.Dropdown.Item title="Routines" value="routine" />
        </List.Dropdown>
      }
    >
      {!searchText && (
        <List.EmptyView icon={Icon.MagnifyingGlass} title="Type to search" description="Search across all your Symphony data" />
      )}

      {data && data.tasks.length > 0 && (
        <List.Section title="Tasks" subtitle={`${data.tasks.length}`}>
          {data.tasks.map((task) => (
            <List.Item
              key={task.id}
              icon={task.completed ? { source: Icon.Checkmark, tintColor: Color.Green } : Icon.Circle}
              title={task.title}
              subtitle={task.project?.name ?? ""}
              accessories={[
                task.context ? { tag: { value: task.context, color: contextColor(task.context) } } : {},
                task.scheduled_for ? { text: task.scheduled_for } : { text: "Inbox" },
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title="Open in Symphony" url={openUrl("task", task.id)} />
                  <Action.CopyToClipboard title="Copy Title" content={task.title} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {data && data.projects.length > 0 && (
        <List.Section title="Projects" subtitle={`${data.projects.length}`}>
          {data.projects.map((project) => (
            <List.Item
              key={project.id}
              icon={Icon.Folder}
              title={project.name}
              accessories={[{ tag: project.status }]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title="Open in Symphony" url={openUrl("project", project.id)} />
                  <Action.CopyToClipboard title="Copy Name" content={project.name} shortcut={{ modifiers: ["cmd"], key: "c" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {data && data.contacts.length > 0 && (
        <List.Section title="Contacts" subtitle={`${data.contacts.length}`}>
          {data.contacts.map((contact) => (
            <List.Item
              key={contact.id}
              icon={Icon.Person}
              title={contact.name}
              subtitle={contact.category ?? ""}
              accessories={[
                contact.phone ? { text: contact.phone } : contact.email ? { text: contact.email } : {},
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title="Open in Symphony" url={openUrl("contact", contact.id)} />
                  {contact.phone && <Action.CopyToClipboard title="Copy Phone" content={contact.phone} />}
                  {contact.email && <Action.CopyToClipboard title="Copy Email" content={contact.email} />}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {data && data.routines.length > 0 && (
        <List.Section title="Routines" subtitle={`${data.routines.length}`}>
          {data.routines.map((routine) => (
            <List.Item
              key={routine.id}
              icon={Icon.RotateClockwise}
              title={routine.name}
              accessories={[
                routine.time_of_day ? { text: routine.time_of_day.slice(0, 5) } : {},
                { tag: routine.is_active ? "Active" : "Paused" },
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser title="Open in Symphony" url={openUrl("routine", routine.id)} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
