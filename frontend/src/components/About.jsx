import { FAMILY_GROUPS, FamilyName, relationshipBase } from './ui'

const ICONS = { parents: '👪', siblings: '🤝', children: '🧒' }

/** ¿Ha contado algo de su familia? */
export const hasFamily = (about) => Boolean(about?.relationship_status || about?.family)

/** Pareja, padres, hermanos e hijos de una persona conectada. */
export function FamilyList({ about }) {
  return (
    <ul className="about-list">
      {about.relationship_status && (
        <li><span aria-hidden="true">💞</span>
          <span>{relationshipBase(about.relationship_status)}
            {about.partner && <> con <FamilyName member={about.partner} /></>}</span></li>
      )}
      {FAMILY_GROUPS.map(([key, label]) => about.family?.[key]?.length > 0 && (
        <li key={key}><span aria-hidden="true">{ICONS[key]}</span>
          <span><b>{label}:</b> {about.family[key].map((m, i) => (
            <span key={i}>{i > 0 && ', '}<FamilyName member={m} /></span>
          ))}</span></li>
      ))}
    </ul>
  )
}
