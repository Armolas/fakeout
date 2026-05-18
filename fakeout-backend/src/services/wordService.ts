import { WORD_BANK } from '../data/wordBank'
import { WordEntry, Difficulty, Category } from '../types'

interface SelectWordOptions {
  excludeWords?: string[]
  difficulty?: Difficulty
  category?: Category
}

export function selectWord(options: SelectWordOptions = {}): WordEntry {
  let pool = [...WORD_BANK]

  if (options.difficulty) {
    const filtered = pool.filter(w => w.difficulty === options.difficulty)
    if (filtered.length > 0) pool = filtered
  }

  if (options.category) {
    const filtered = pool.filter(w => w.category === options.category)
    if (filtered.length > 0) pool = filtered
  }

  if (options.excludeWords?.length) {
    const filtered = pool.filter(
      w => !options.excludeWords!.includes(w.word.toLowerCase())
    )
    if (filtered.length > 0) pool = filtered
  }

  return pool[Math.floor(Math.random() * pool.length)]
}

export function getWordCount(): number {
  return WORD_BANK.length
}
