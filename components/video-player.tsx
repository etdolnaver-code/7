'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Info, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, send } from '@/lib/client';

type Player = { getDuration(): number; destroy(): void };
type PlayerEvent = { data: number; target: Player };
type YouTubeApi = { Player: new (element: HTMLIFrameElement, options: {
  events: { onStateChange(event: PlayerEvent): void; onError(): void };
}) => Player };
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let youtubeApiPromise: Promise<YouTubeApi> | null = null;
function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApiPromise) youtubeApiPromise = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT) resolve(window.YT);
      else reject(new Error('영상 플레이어를 불러오지 못했습니다.'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => reject(new Error('영상 플레이어를 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

export function VideoPlayer({ id, youtubeId, title }: { id: string; youtubeId: string; title: string }) {
  const [eventId, setEventId] = useState('');
  const [origin, setOrigin] = useState('');
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!eventId || !frame.current) return;
    let active = true;
    let player: Player | undefined;
    loadYouTubeApi().then((yt) => {
      if (!active || !frame.current) return;
      player = new yt.Player(frame.current, {
        events: {
          onStateChange: (event) => {
            if (event.data !== 0 || !active) return;
            const durationSeconds = event.target.getDuration();
            if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
              setError('영상 길이를 확인할 수 없습니다. 다시 재생해 주세요.');
              return;
            }
            void api<{ completedVideoIds: string[] }>('video-events/complete', send({ eventId, durationSeconds }))
              .then(() => { if (active) { setCompleted(true); setError(''); } })
              .catch((reason) => { if (active) setError((reason as Error).message); });
          },
          onError: () => setError('영상을 재생할 수 없습니다. 현장 담당자에게 문의해 주세요.'),
        },
      });
    }).catch((reason) => { if (active) setError((reason as Error).message); });
    return () => { active = false; player?.destroy(); };
  }, [eventId]);

  async function play() {
    setBusy(true);
    setError('');
    try {
      await api('bootstrap');
      const event = await api<{ eventId: string }>('video-events', send({ videoId: id }));
      setOrigin(window.location.origin);
      setEventId(event.eventId);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="education-page">
      <button type="button" className="text-button" onClick={() => {
        window.close();
        window.setTimeout(() => window.location.assign('/'), 150);
      }}><ArrowLeft size={17} /> 출입등록으로 돌아가기</button>
      <div className="eyebrow mt-8">SAFETY TRAINING</div>
      <h1>{title}</h1>
      <div className="video-stage">
        {eventId ? (
          <iframe ref={frame} title={title}
            src={'https://www.youtube-nocookie.com/embed/' + youtubeId + '?autoplay=1&enablejsapi=1&origin=' + encodeURIComponent(origin)}
            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <button type="button" onClick={play} disabled={busy}>
            <Play size={48} /><span>{busy ? '영상 준비 중…' : '영상 시청 시작'}</span>
          </button>
        )}
      </div>
      {completed && <p className="notice"><CheckCircle2 size={20} /> 이 영상의 시청 완료가 기록되었습니다.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="notice"><Info size={22} />
        <span>영상이 정상적으로 끝나야 시청 완료로 기록됩니다. 시청 완료 기록은 실제 안전교육 이수 확인과 구분됩니다.</span>
      </div>
      <p className="field-help">재생을 시작하면 YouTube 외부 서비스가 연결됩니다. 이 창을 닫아도 원래 등록 창의 입력 내용은 유지됩니다.</p>
    </main>
  );
}
