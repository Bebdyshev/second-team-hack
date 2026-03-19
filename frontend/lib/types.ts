export type Organization = {
  id: string
  name: string
}

export type Membership = {
  organization_id: string
  organization_name: string
  role: 'Owner' | 'Admin' | 'Manager' | 'Employee' | 'Analyst' | 'Legal' | string
}

export type UserProfile = {
  id: string
  email: string
  full_name: string
  organizations: Organization[]
  memberships: Membership[]
}

export type AuthResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  user: UserProfile
}
