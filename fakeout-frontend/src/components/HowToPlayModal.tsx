import { X, Users, Eye, MessageSquare, MessageCircle, Vote, Trophy } from 'lucide-react'

interface Props {
  onClose: () => void
}

const STEPS = [
  {
    icon: <Users size={18} />,
    title: 'Join a game',
    body: 'Connect your wallet and join or create a game with 3–10 players.',
  },
  {
    icon: <Eye size={18} />,
    title: 'Learn your role',
    body: 'Crewmates see the secret word. Impostors get a vague hint — they must bluff.',
  },
  {
    icon: <MessageSquare size={18} />,
    title: 'Describe the word',
    body: 'Players take turns in random order. You have 20 seconds to describe your word (or fake it convincingly).',
  },
  {
    icon: <MessageCircle size={18} />,
    title: 'Open discussion',
    body: 'After all descriptions, a 90-second open chat lets everyone argue their case and accuse suspects.',
  },
  {
    icon: <Vote size={18} />,
    title: 'Vote to eliminate',
    body: 'The group votes on who they think the impostor is. The player with the most votes is eliminated.',
  },
  {
    icon: <Trophy size={18} />,
    title: 'Win the pot',
    body: 'Crewmates win by eliminating all impostors. Impostors win by equalling or outnumbering crewmates. Staked games pay out to winners.',
  },
]

export function HowToPlayModal({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card howtoplay-card" onClick={e => e.stopPropagation()}>
        <button className="howtoplay-close btn btn-ghost btn-sm" onClick={onClose}>
          <X size={18} />
        </button>

        <h2 className="modal-title">How to Play</h2>

        <div className="howtoplay-steps">
          {STEPS.map((step, i) => (
            <div key={i} className="howtoplay-step">
              <div className="howtoplay-step-icon">{step.icon}</div>
              <div>
                <p className="howtoplay-step-title">{step.title}</p>
                <p className="howtoplay-step-body">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-lg" onClick={onClose}>Got it!</button>
      </div>
    </div>
  )
}
