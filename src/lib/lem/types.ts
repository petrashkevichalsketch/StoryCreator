// Общие типы «Калькулятора Лема», используемые и на сервере, и в браузере

export type Tone = 'dark' | 'light' | 'ironic' | 'neutral'

export const TONES: Tone[] = ['dark', 'light', 'ironic', 'neutral']

export const TONE_LABELS: Record<Tone, string> = {
  dark: 'мрачно',
  light: 'светло',
  ironic: 'иронично',
  neutral: 'нейтрально',
}

export type ProviderCode = 'openai' | 'anthropic' | 'glm' | 'deepseek' | 'ollama' | 'aiai' | 'zai' | 'demo'

export interface NodeDTO {
  id: string
  parentId: string | null
  level: number
  act: string
  title: string
  description: string
  consequences: string
  tone: Tone | null
  tags: string[]
  isChosen: boolean
  isLem: boolean
  quip: string | null
  isFinal: boolean
  generationId: string | null
  /** вариант переписан автором вручную — для промпта и бейджа на карточке */
  editedByAuthor: boolean
  createdAt: string
}

export interface ProjectDTO {
  id: string
  name: string
  category: string | null
  premise: string | null
  provider: string | null
  model: string | null
  currentNodeId: string | null
  updatedAt: string
}

export interface TreePayload {
  project: ProjectDTO
  nodes: NodeDTO[]
  /** id узлов активного пути: от текущего узла вверх до корня */
  activePathIds: string[]
  /** цепочка пути от корня до текущего узла */
  path: NodeDTO[]
  /** текущий узел (последний выбранный) */
  currentNode: NodeDTO | null
}

export interface ProjectListItem {
  id: string
  name: string
  category: string | null
  premise: string | null
  provider: string | null
  model: string | null
  updatedAt: string
  level: number // уровень текущего узла; 0 — не начат
  isFinal: boolean
}

export interface SettingsDTO {
  provider: ProviderCode
  model: string
  temperature: number
  waveSize: number
  lemPauseSec: number
  baseUrls: Record<string, string>
  onboarded: boolean
  /** какие ключи сохранены (сами ключи браузеру не передаются никогда) */
  keys: Record<string, boolean>
}

export interface WaveErrorInfo {
  message: string
  kind: 'provider' | 'invalid' | 'unknown'
  raw?: string
}
