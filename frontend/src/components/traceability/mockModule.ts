// MOCK: `requirements` has no module column in the backend (see
// docs/superpowers/specs/2026-08-11-traceability-matrix-redesign-design.md,
// "Backend gaps"). Deterministic so the value is stable across reloads and the
// module filter behaves consistently — never randomized per render.
export const MOCK_MODULES = [
  'Authentication',
  'Loan Origination',
  'Payments',
  'Customer 360',
  'Onboarding KYC',
  'Notifications',
  'Reporting',
  'Admin & Roles',
] as const

export type MockModule = (typeof MOCK_MODULES)[number]

export function mockModuleFor(requirementId: number): MockModule {
  const index = ((requirementId % MOCK_MODULES.length) + MOCK_MODULES.length) % MOCK_MODULES.length
  return MOCK_MODULES[index]
}
