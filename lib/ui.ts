export const inputClass =
  'mt-1.5 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40'

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

export const primaryBtn = `${base} bg-brand-gradient text-white shadow-lg shadow-primary/25 hover:brightness-110`
export const outlineBtn = `${base} border border-line bg-card text-foreground hover:bg-surface`
export const dangerBtn = `${base} border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20`

// Turns database error messages into plain sentences.
export function friendlyError(message: string): string {
  if (/room not found/i.test(message)) return 'No room found with that code. Check the code and try again.'
  if (/room is full/i.test(message)) return 'This room is full.'
  if (/rooms_name_check/i.test(message)) return 'Room name must be 3 to 60 characters.'
  if (/rooms_description_check/i.test(message)) return 'Description can be up to 300 characters.'
  if (/max_members/i.test(message)) return 'Room size must be between 2 and 50.'
  if (/only the host/i.test(message)) return 'Only the host can do that.'
  if (/https/i.test(message)) return 'The video link must start with https://'
  if (/invalid position/i.test(message)) return 'That playback position is not valid.'
  if (/too fast/i.test(message)) return 'You are sending messages too fast. Wait a moment.'
  if (/permission/i.test(message)) return 'You do not have permission to do that.'
  if (/not in the room/i.test(message)) return 'That person is not in the room.'
  if (/queue is full/i.test(message)) return 'The queue is full (50 videos).'
  if (/not in the queue/i.test(message)) return 'That video is no longer in the queue.'
  if (/profiles_username_check/i.test(message)) return 'Username must be 3 to 20 characters: letters, numbers and underscore only.'
  if (/profiles_username/i.test(message)) return 'That username is already taken.'
  if (/limit of 10 rooms/i.test(message)) return 'You can host up to 10 rooms. Delete one first.'
  if (/not signed in/i.test(message)) return 'Please log in again.'
  return 'Something went wrong. Please try again.'
}
