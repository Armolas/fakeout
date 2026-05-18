import { WordEntry } from '../types'

export const WORD_BANK: WordEntry[] = [
  // ─── Animals ──────────────────────────────────────────────────────────────
  { word: 'Elephant', hint: 'Trunk', category: 'animals', difficulty: 'easy' },
  { word: 'Giraffe', hint: 'Neck', category: 'animals', difficulty: 'easy' },
  { word: 'Penguin', hint: 'Antarctica', category: 'animals', difficulty: 'easy' },
  { word: 'Chameleon', hint: 'Camouflage', category: 'animals', difficulty: 'medium' },
  { word: 'Platypus', hint: 'Venomous', category: 'animals', difficulty: 'hard' },
  { word: 'Flamingo', hint: 'Pink', category: 'animals', difficulty: 'easy' },
  { word: 'Cheetah', hint: 'Speed', category: 'animals', difficulty: 'easy' },
  { word: 'Octopus', hint: 'Tentacles', category: 'animals', difficulty: 'medium' },
  { word: 'Porcupine', hint: 'Quills', category: 'animals', difficulty: 'medium' },
  { word: 'Narwhal', hint: 'Horn', category: 'animals', difficulty: 'hard' },
  { word: 'Axolotl', hint: 'Regeneration', category: 'animals', difficulty: 'hard' },
  { word: 'Dolphin', hint: 'Sonar', category: 'animals', difficulty: 'easy' },

  // ─── Food ─────────────────────────────────────────────────────────────────
  { word: 'Pizza', hint: 'Italian', category: 'food', difficulty: 'easy' },
  { word: 'Sushi', hint: 'Raw', category: 'food', difficulty: 'easy' },
  { word: 'Tiramisu', hint: 'Coffee', category: 'food', difficulty: 'medium' },
  { word: 'Croissant', hint: 'Flaky', category: 'food', difficulty: 'easy' },
  { word: 'Guacamole', hint: 'Avocado', category: 'food', difficulty: 'medium' },
  { word: 'Ramen', hint: 'Broth', category: 'food', difficulty: 'easy' },
  { word: 'Fondue', hint: 'Melted', category: 'food', difficulty: 'medium' },
  { word: 'Baklava', hint: 'Honey', category: 'food', difficulty: 'hard' },
  { word: 'Jollof', hint: 'Rice', category: 'food', difficulty: 'medium' },
  { word: 'Suya', hint: 'Skewer', category: 'food', difficulty: 'medium' },
  { word: 'Pancake', hint: 'Syrup', category: 'food', difficulty: 'easy' },
  { word: 'Burger', hint: 'Bun', category: 'food', difficulty: 'easy' },

  // ─── Sports ───────────────────────────────────────────────────────────────
  { word: 'Basketball', hint: 'Hoop', category: 'sports', difficulty: 'easy' },
  { word: 'Fencing', hint: 'Blade', category: 'sports', difficulty: 'medium' },
  { word: 'Curling', hint: 'Broom', category: 'sports', difficulty: 'hard' },
  { word: 'Surfing', hint: 'Wave', category: 'sports', difficulty: 'easy' },
  { word: 'Archery', hint: 'Arrow', category: 'sports', difficulty: 'medium' },
  { word: 'Wrestling', hint: 'Grapple', category: 'sports', difficulty: 'easy' },
  { word: 'Gymnastics', hint: 'Flexibility', category: 'sports', difficulty: 'medium' },
  { word: 'Polo', hint: 'Horse', category: 'sports', difficulty: 'hard' },
  { word: 'Cricket', hint: 'Wicket', category: 'sports', difficulty: 'medium' },
  { word: 'Badminton', hint: 'Shuttle', category: 'sports', difficulty: 'easy' },

  // ─── Places ───────────────────────────────────────────────────────────────
  { word: 'Library', hint: 'Books', category: 'places', difficulty: 'easy' },
  { word: 'Vineyard', hint: 'Grapes', category: 'places', difficulty: 'medium' },
  { word: 'Lighthouse', hint: 'Beacon', category: 'places', difficulty: 'easy' },
  { word: 'Bazaar', hint: 'Market', category: 'places', difficulty: 'medium' },
  { word: 'Cathedral', hint: 'Spire', category: 'places', difficulty: 'medium' },
  { word: 'Casino', hint: 'Gambling', category: 'places', difficulty: 'easy' },
  { word: 'Submarine', hint: 'Underwater', category: 'places', difficulty: 'medium' },
  { word: 'Observatory', hint: 'Telescope', category: 'places', difficulty: 'hard' },
  { word: 'Colosseum', hint: 'Gladiators', category: 'places', difficulty: 'medium' },

  // ─── Objects ──────────────────────────────────────────────────────────────
  { word: 'Compass', hint: 'Direction', category: 'objects', difficulty: 'easy' },
  { word: 'Abacus', hint: 'Counting', category: 'objects', difficulty: 'medium' },
  { word: 'Hourglass', hint: 'Sand', category: 'objects', difficulty: 'easy' },
  { word: 'Telescope', hint: 'Stars', category: 'objects', difficulty: 'easy' },
  { word: 'Microscope', hint: 'Cells', category: 'objects', difficulty: 'medium' },
  { word: 'Periscope', hint: 'Submarine', category: 'objects', difficulty: 'hard' },
  { word: 'Metronome', hint: 'Tempo', category: 'objects', difficulty: 'hard' },
  { word: 'Boomerang', hint: 'Returns', category: 'objects', difficulty: 'medium' },
  { word: 'Kaleidoscope', hint: 'Patterns', category: 'objects', difficulty: 'hard' },
  { word: 'Harmonica', hint: 'Breath', category: 'objects', difficulty: 'medium' },

  // ─── Professions ──────────────────────────────────────────────────────────
  { word: 'Surgeon', hint: 'Scalpel', category: 'professions', difficulty: 'easy' },
  { word: 'Sommelier', hint: 'Wine', category: 'professions', difficulty: 'hard' },
  { word: 'Blacksmith', hint: 'Forge', category: 'professions', difficulty: 'medium' },
  { word: 'Cartographer', hint: 'Maps', category: 'professions', difficulty: 'hard' },
  { word: 'Apiarist', hint: 'Bees', category: 'professions', difficulty: 'hard' },
  { word: 'Locksmith', hint: 'Keys', category: 'professions', difficulty: 'medium' },
  { word: 'Taxidermist', hint: 'Stuffing', category: 'professions', difficulty: 'hard' },
  { word: 'Conductor', hint: 'Baton', category: 'professions', difficulty: 'medium' },
  { word: 'Archaeologist', hint: 'Excavation', category: 'professions', difficulty: 'medium' },

  // ─── Nature ───────────────────────────────────────────────────────────────
  { word: 'Volcano', hint: 'Lava', category: 'nature', difficulty: 'easy' },
  { word: 'Aurora', hint: 'Polar', category: 'nature', difficulty: 'medium' },
  { word: 'Glacier', hint: 'Ice', category: 'nature', difficulty: 'medium' },
  { word: 'Tornado', hint: 'Funnel', category: 'nature', difficulty: 'easy' },
  { word: 'Stalactite', hint: 'Cave', category: 'nature', difficulty: 'hard' },
  { word: 'Mangrove', hint: 'Roots', category: 'nature', difficulty: 'hard' },
  { word: 'Geyser', hint: 'Steam', category: 'nature', difficulty: 'medium' },
  { word: 'Avalanche', hint: 'Snow', category: 'nature', difficulty: 'medium' },
  { word: 'Delta', hint: 'River', category: 'nature', difficulty: 'medium' },

  // ─── Technology ───────────────────────────────────────────────────────────
  { word: 'Firewall', hint: 'Security', category: 'technology', difficulty: 'medium' },
  { word: 'Blockchain', hint: 'Ledger', category: 'technology', difficulty: 'hard' },
  { word: 'Algorithm', hint: 'Steps', category: 'technology', difficulty: 'medium' },
  { word: 'Drone', hint: 'Aerial', category: 'technology', difficulty: 'easy' },
  { word: 'Satellite', hint: 'Orbit', category: 'technology', difficulty: 'medium' },
  { word: 'Transistor', hint: 'Switch', category: 'technology', difficulty: 'hard' },
  { word: 'Router', hint: 'Network', category: 'technology', difficulty: 'medium' },
  { word: 'Hologram', hint: 'Projection', category: 'technology', difficulty: 'hard' },

  // ─── Movies ───────────────────────────────────────────────────────────────
  { word: 'Sequel', hint: 'Continuation', category: 'movies', difficulty: 'medium' },
  { word: 'Screenplay', hint: 'Script', category: 'movies', difficulty: 'medium' },
  { word: 'Premiere', hint: 'Opening', category: 'movies', difficulty: 'easy' },
  { word: 'Stuntman', hint: 'Danger', category: 'movies', difficulty: 'easy' },
  { word: 'Blockbuster', hint: 'Hit', category: 'movies', difficulty: 'easy' },

  // ─── Music ────────────────────────────────────────────────────────────────
  { word: 'Bassline', hint: 'Rhythm', category: 'music', difficulty: 'medium' },
  { word: 'Crescendo', hint: 'Louder', category: 'music', difficulty: 'hard' },
  { word: 'Vinyl', hint: 'Record', category: 'music', difficulty: 'medium' },
  { word: 'Pitch', hint: 'Frequency', category: 'music', difficulty: 'easy' },
  { word: 'Chorus', hint: 'Refrain', category: 'music', difficulty: 'easy' },
  { word: 'Acapella', hint: 'Unaccompanied', category: 'music', difficulty: 'hard' },
]
