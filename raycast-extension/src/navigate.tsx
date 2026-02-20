import { Action, ActionPanel, Icon, List } from "@raycast/api";

const APP_URL = "https://symphonyos.app";

interface NavItem {
  title: string;
  icon: Icon;
  path: string;
  keywords: string[];
}

const NAV_ITEMS: NavItem[] = [
  { title: "Today", icon: Icon.Calendar, path: "/", keywords: ["home", "schedule", "daily"] },
  { title: "Projects", icon: Icon.Folder, path: "/projects", keywords: ["plans"] },
  { title: "Routines", icon: Icon.RotateClockwise, path: "/routines", keywords: ["habits", "recurring"] },
  { title: "Contacts", icon: Icon.Person, path: "/contacts", keywords: ["people", "address book"] },
  { title: "Goals", icon: Icon.BullsEye, path: "/goals", keywords: ["objectives", "okr"] },
  { title: "Notes", icon: Icon.Document, path: "/notes", keywords: ["journal", "writing"] },
  { title: "Lists", icon: Icon.List, path: "/lists", keywords: ["reference", "books", "movies"] },
  { title: "Coaching", icon: Icon.Stars, path: "/coaching", keywords: ["playbook", "family", "parenting"] },
  { title: "Settings", icon: Icon.Gear, path: "/settings", keywords: ["preferences", "account"] },
];

export default function Navigate() {
  return (
    <List searchBarPlaceholder="Where do you want to go?">
      {NAV_ITEMS.map((item) => (
        <List.Item
          key={item.path}
          icon={item.icon}
          title={item.title}
          keywords={item.keywords}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title={`Open ${item.title}`} url={`${APP_URL}${item.path}`} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
