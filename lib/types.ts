export type Room = {
  id: string
  code: string
  name: string
  description: string
  is_public: boolean
  host_id: string
  max_members: number
  allow_member_control: boolean
  created_at: string
}

export type Member = {
  user_id: string
  joined_at: string
  username: string
  avatar_color: string
  is_host: boolean
  online: boolean
}

export type ExploreRoom = {
  id: string
  code: string
  name: string
  description: string
  max_members: number
  member_count: number
  host_username: string
}

export type DriveLinkRow = {
  id: string
  token: string
  source: 'public_link' | 'oauth'
  title: string
  mime_type: string
  size_bytes: number
  thumbnail_url: string | null
  status: 'active' | 'revoked'
  last_error: string | null
  created_at: string
}
