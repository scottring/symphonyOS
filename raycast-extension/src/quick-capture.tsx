import { Action, ActionPanel, Form, showToast, Toast, popToRoot } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { getAuthenticatedClient } from "./lib/supabase";

interface CaptureValues {
  title: string;
  context: string;
  notes: string;
}

export default function QuickCapture() {
  const { handleSubmit, itemProps } = useForm<CaptureValues>({
    async onSubmit(values) {
      const toast = await showToast({ style: Toast.Style.Animated, title: "Capturing..." });
      try {
        const { client, userId } = await getAuthenticatedClient();
        const { error } = await client.from("tasks").insert({
          title: values.title,
          user_id: userId,
          context: values.context || null,
          notes: values.notes || null,
          completed: false,
        });

        if (error) throw error;

        toast.style = Toast.Style.Success;
        toast.title = "Added to inbox";
        toast.message = values.title;
        popToRoot();
      } catch (err) {
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to capture";
        toast.message = String(err);
      }
    },
    validation: {
      title: FormValidation.Required,
    },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Capture Task" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField title="Task" placeholder="What needs to be done?" autoFocus {...itemProps.title} />
      <Form.Dropdown title="Context" id="context" defaultValue="">
        <Form.Dropdown.Item value="" title="None (Inbox)" />
        <Form.Dropdown.Item value="work" title="Work" />
        <Form.Dropdown.Item value="family" title="Family" />
        <Form.Dropdown.Item value="personal" title="Personal" />
      </Form.Dropdown>
      <Form.TextArea title="Notes" placeholder="Optional notes..." {...itemProps.notes} />
    </Form>
  );
}
