import { Icons } from './icons';

/** ? / pin / close buttons at the right of a panel title bar (RE-style panel chrome). */
export function FrameButtons({ help, onPin, pinned, onClose }: { help: string; onPin?: () => void; pinned?: boolean; onClose?: () => void }) {
  return (
    <span className="rs-frame-btns">
      <span className="rs-frame-btn help" title={help}>
        ?
      </span>
      <span className={`rs-frame-btn${pinned ? ' on' : ''}`} title={pinned ? 'Pinned' : 'Pin'} onClick={onPin}>
        <Icons.Pin size={11} />
      </span>
      <span className="rs-frame-btn" title="Fold the panel (double-click the title bar to show it again)" onClick={onClose}>
        <Icons.Close size={10} />
      </span>
    </span>
  );
}
