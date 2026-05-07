export interface EventDiscussionFlag {
  id: string
  userId: string
  googleEventBaseId: string
  eventTitle?: string
  calendarId?: string
  discussionNote?: string
  createdAt: Date
  updatedAt: Date
}
