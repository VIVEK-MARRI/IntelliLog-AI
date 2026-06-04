import React from 'react'
import { Lightbulb, ArrowRight } from '@phosphor-icons/react'

interface SuggestedQuestionsProps {
  onSelectQuestion: (question: string) => void
}

const SUGGESTIONS = [
  { q: 'Which shipments are likely to miss SLA today?', icon: Lightbulb },
  { q: 'Show me high-risk routes on the West Coast', icon: Lightbulb },
  { q: 'Optimize Northeast corridor deliveries', icon: Lightbulb },
  { q: 'Summarize fleet health and top risks', icon: Lightbulb },
]

export const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onSelectQuestion }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-mist">
      Suggested Queries
    </p>
    <div className="grid grid-cols-1 gap-1.5">
      {SUGGESTIONS.map(({ q, icon: Icon }) => (
        <button
          key={q}
          onClick={() => onSelectQuestion(q)}
          className="flex items-center gap-2 text-left text-[11px] px-3 py-2.5 bg-navy/60 hover:bg-navy border border-steel-grey/30 hover:border-accent/40 rounded-lg text-mist hover:text-pearl transition-all duration-200 group"
        >
          <Icon size={12} className="text-accent/60 group-hover:text-accent shrink-0" weight="duotone" />
          <span className="flex-1 leading-snug">{q}</span>
          <ArrowRight size={10} className="text-mist/0 group-hover:text-accent transition-all duration-200" weight="bold" />
        </button>
      ))}
    </div>
  </div>
)
