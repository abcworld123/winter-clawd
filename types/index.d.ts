export type WinterScene = 'snow' | 'scene'

// `seed` starts the row's own random snow and walk.
export type WinterRow = { id: string; scene: WinterScene; seed: number }

declare module 'claude-code' {
  interface PluginState {
    'winter-clawd': { active: WinterRow | null }
  }
}
