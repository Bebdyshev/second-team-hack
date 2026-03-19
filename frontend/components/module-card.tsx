type ModuleCardProps = {
  title: string
  description: string
}

const ModuleCard = ({ title, description }: ModuleCardProps) => {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </article>
  )
}

export default ModuleCard
