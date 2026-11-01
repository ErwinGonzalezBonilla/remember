import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Avatar } from '../../components/ui'
import { countsText, statusText } from './capsuleUtils'

export default function CapsuleCard({ c }) {
  const who = c.is_author ? (c.person ? `Para ${c.person.name}` : 'Sin destinatario') : `De ${c.author_name}`
  const extra = countsText(c.item_counts)
  return (
    <Link to={`/capsula/${c.id}`} className={`capsule-card ${c.status}`}>
      <span className="capsule-seal">
        <Icon name={c.status === 'open' ? 'gift' : c.status === 'sealed' ? 'lock' : 'edit'} size={22} />
      </span>
      <span className="capsule-card-text">
        <strong>{c.title}</strong>
        <small>{who}{extra && ` · ${extra}`}</small>
        <small className="capsule-status">{statusText(c)}</small>
      </span>
      {c.is_author && c.person
        ? <Avatar name={c.person.name} src={c.person.photo_url} size={34} />
        : !c.is_author && <Avatar name={c.author_name} src={c.author_avatar} size={34} />}
    </Link>
  )
}
