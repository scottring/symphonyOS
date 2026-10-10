// Dev-only route body: /kiosk-preview?scene=dinner&theme=dark renders one
// approved kiosk board with fixed data (no reads, writes or calls).
import { useSearchParams } from 'react-router-dom'
import { KioskCanvasPreview } from './KioskCanvasPreview'

type PreviewProps = Parameters<typeof KioskCanvasPreview>[0]

export default function KioskScenePreviewRoute() {
  const [params] = useSearchParams()
  const scene = (params.get('scene') ?? 'home-evening') as NonNullable<PreviewProps['scene']>
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  return <KioskCanvasPreview scene={scene} theme={theme} />
}
