export default function PageHeader({ icon: Icon, title, subtitle, accent = 'brand', action }) {
  const accents = {
    brand:   'from-brand-500/20 to-indigo-500/10 border-brand-500/30 text-brand-400',
    amber:   'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
    emerald: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
    violet:  'from-violet-500/20 to-purple-500/10 border-violet-500/30 text-violet-400',
    rose:    'from-rose-500/20 to-pink-500/10 border-rose-500/30 text-rose-400',
    cyan:    'from-cyan-500/20 to-sky-500/10 border-cyan-500/30 text-cyan-400',
    blue:    'from-blue-500/20 to-indigo-500/10 border-blue-500/30 text-blue-400',
  };

  return (
    <div className={`glass-card p-6 bg-gradient-to-r ${accents[accent] || accents.brand} border`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="p-3 rounded-xl bg-black/20">
              <Icon className="w-7 h-7" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
            {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}
