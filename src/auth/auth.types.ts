// What we put in the JWT. Only identity - roles and tenant access are read
// from memberships on every request, so changes apply immediately.
export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
}
