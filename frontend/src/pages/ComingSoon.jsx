import { Construction } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Urdu translations for ComingSoon strings
const comingSoonStrings = {
  en: {
    backendReady: 'Backend ✓',
    frontendWip: 'Frontend — In Progress',
    description: 'This module is being built. Backend models, routes, and API endpoints are ready. The UI is coming next!',
  },
  ur: {
    backendReady: 'بیک اینڈ ✓',
    frontendWip: 'فرنٹ اینڈ — جاری ہے',
    description: 'یہ ماڈیول بنایا جا رہا ہے۔ بیک اینڈ ماڈلز، راؤٹس اور API اینڈ پوائنٹس تیار ہیں۔ UI جلد آنے والا ہے!',
  },
};

export default function ComingSoon({ title }) {
  const { lang } = useTheme();
  const s = comingSoonStrings[lang] ?? comingSoonStrings.en;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
        <Construction className="w-8 h-8 text-brand-500" />
      </div>
      <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      <p className="text-center max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        {s.description}
      </p>
      <div className="flex gap-2 mt-2">
        <span className="badge badge-green">{s.backendReady}</span>
        <span className="badge badge-yellow">{s.frontendWip}</span>
      </div>
    </div>
  );
}
