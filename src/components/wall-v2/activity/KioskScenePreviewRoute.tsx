// Dev-only route body: /kiosk-preview?scene=dinner&theme=dark renders one
// approved kiosk board with fixed data (no reads, writes or calls);
// &v1=night shows a wall v1 Home screen instead; &dock=listening|quiet|muted
// holds the conversation dock in that state.
import { useSearchParams } from 'react-router-dom'
import { KioskCanvasPreview } from './KioskCanvasPreview'

type PreviewProps = Parameters<typeof KioskCanvasPreview>[0]

export default function KioskScenePreviewRoute() {
  const [params] = useSearchParams()
  const scene = (params.get('scene') ?? 'home-evening') as NonNullable<PreviewProps['scene']>
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  const v1Screen = (params.get('v1') ?? undefined) as PreviewProps['v1Screen']
  const dock = (params.get('dock') ?? undefined) as PreviewProps['dock']
  return <KioskCanvasPreview scene={scene} theme={theme} v1Screen={v1Screen} dock={dock} />
}
