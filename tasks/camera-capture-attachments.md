# Camera Capture for Attachments

## Overview

Add ability to take photos directly within Symphony for attaching receipts, documents, and other items. Works on both mobile (native camera) and desktop (webcam).

**Use case:** User has "Buy paint at Home Depot" task → takes photo of receipt → attached to task for records.

---

## Platform Approaches

### Mobile: Native Camera (Simple)

Use HTML5 `capture` attribute - opens device camera directly:

```html
<input type="file" accept="image/*" capture="environment">
```

- `capture="environment"` = back camera (for documents)
- `capture="user"` = front camera (selfies, not needed here)
- Returns image file, flows into existing attachment upload

### Desktop: WebRTC Camera Modal

Use `getUserMedia` API to access webcam:

```typescript
const stream = await navigator.mediaDevices.getUserMedia({ 
  video: { 
    facingMode: 'environment', // Prefer back camera if available
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  } 
})
```

Opens modal with live preview → capture → confirm → attach.

---

## UI Design

### Attachment Section (Updated)

```
┌─────────────────────────────────────────┐
│  Attachments (2)                        │
│                                         │
│  ┌──────┐ ┌──────┐                     │
│  │ 📄   │ │ 🖼️   │                     │
│  │ doc  │ │ img  │                     │
│  └──────┘ └──────┘                     │
│                                         │
│  ┌─────────────┐ ┌─────────────┐       │
│  │ 📁 Upload   │ │ 📷 Camera   │       │
│  └─────────────┘ └─────────────┘       │
└─────────────────────────────────────────┘
```

### Mobile: Camera Button Behavior

Tap "📷 Camera" → Opens native camera app → Take photo → Returns to Symphony with image attached.

No custom UI needed - OS handles everything.

### Desktop: Camera Modal

Tap "📷 Camera" → Opens CameraCapture modal:

```
┌─────────────────────────────────────────────────┐
│  Take Photo                              ✕      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │                                         │   │
│  │           [ Live Camera Feed ]          │   │
│  │              (no mirroring)             │   │
│  │                                         │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│              ┌──────────────────┐              │
│              │   ◉  Capture     │              │
│              └──────────────────┘              │
│                                                 │
└─────────────────────────────────────────────────┘
```

After capture (review mode):

```
┌─────────────────────────────────────────────────┐
│  Take Photo                              ✕      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  │                                         │   │
│  │         [ Captured Image Preview ]      │   │
│  │                                         │   │
│  │                                         │   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│       ┌──────────┐    ┌──────────────┐        │
│       │ Retake   │    │ ✓ Use Photo  │        │
│       └──────────┘    └──────────────┘        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Implementation

### New Component: CameraCaptureModal

```typescript
// src/components/attachments/CameraCaptureModal.tsx

interface CameraCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (imageBlob: Blob) => void
}

export function CameraCaptureModal({ isOpen, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Start camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera()
    }
    return () => stopCamera()
  }, [isOpen])

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setError(null)
    } catch (err) {
      setError('Camera access denied. Please enable camera permissions.')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    
    // Set canvas to video dimensions
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // Draw current frame (NOT mirrored - important for documents)
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(video, 0, 0)
    
    // Convert to data URL for preview
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedImage(imageDataUrl)
  }

  const handleRetake = () => {
    setCapturedImage(null)
  }

  const handleUsePhoto = async () => {
    if (!canvasRef.current) return

    // Convert canvas to blob
    canvasRef.current.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob)
          onClose()
        }
      },
      'image/jpeg',
      0.9
    )
  }

  // ... render modal UI
}
```

### Update AttachmentUpload Component

```typescript
// src/components/attachments/AttachmentUpload.tsx

export function AttachmentUpload({ entityType, entityId, onUpload }: Props) {
  const isMobile = useIsMobile()
  const [showCameraModal, setShowCameraModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleCameraCapture = async (blob: Blob) => {
    // Create File from Blob
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
    await onUpload(file)
  }

  return (
    <div className="flex gap-2">
      {/* Upload file button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 rounded-lg border border-dashed border-neutral-200"
      >
        <FolderIcon className="w-4 h-4" />
        Upload
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_FILE_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Camera button */}
      {isMobile ? (
        // Mobile: native camera input
        <>
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 rounded-lg border border-dashed border-neutral-200"
          >
            <CameraIcon className="w-4 h-4" />
            Camera
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />
        </>
      ) : (
        // Desktop: webcam modal
        <>
          <button
            onClick={() => setShowCameraModal(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-800 hover:bg-neutral-50 rounded-lg border border-dashed border-neutral-200"
          >
            <CameraIcon className="w-4 h-4" />
            Camera
          </button>
          <CameraCaptureModal
            isOpen={showCameraModal}
            onClose={() => setShowCameraModal(false)}
            onCapture={handleCameraCapture}
          />
        </>
      )}
    </div>
  )
}
```

---

## Error Handling

### No Camera Available

```
┌─────────────────────────────────────────────────┐
│  Take Photo                              ✕      │
├─────────────────────────────────────────────────┤
│                                                 │
│         ┌─────────────────────┐                │
│         │   📷   │                │
│         │        ╱╲               │                │
│         └─────────────────────┘                │
│                                                 │
│     No camera detected                         │
│                                                 │
│     Connect a webcam or use the               │
│     Upload button to add files.               │
│                                                 │
│              ┌──────────────┐                  │
│              │    Close     │                  │
│              └──────────────┘                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Permission Denied

```
┌─────────────────────────────────────────────────┐
│  Take Photo                              ✕      │
├─────────────────────────────────────────────────┤
│                                                 │
│         ┌─────────────────────┐                │
│         │        🔒          │                │
│         └─────────────────────┘                │
│                                                 │
│     Camera access denied                       │
│                                                 │
│     Please enable camera permissions          │
│     in your browser settings.                 │
│                                                 │
│     ┌──────────────┐  ┌──────────────┐        │
│     │    Close     │  │  Try Again   │        │
│     └──────────────┘  └──────────────┘        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Technical Notes

### No Mirroring

Document/receipt capture should NOT mirror the image:

```css
/* Do NOT add this for document capture */
/* video { transform: scaleX(-1); } */
```

The preview shows exactly what will be captured - text reads correctly.

### Image Quality

```typescript
// High quality for receipts (readable text)
canvas.toBlob(callback, 'image/jpeg', 0.9) // 90% quality

// Dimensions from actual video feed
canvas.width = video.videoWidth   // Could be 1920
canvas.height = video.videoHeight // Could be 1080
```

### Cleanup

Always stop camera stream when:
- Modal closes
- Component unmounts
- User navigates away

```typescript
stream.getTracks().forEach(track => track.stop())
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/attachments/CameraCaptureModal.tsx` | Desktop webcam capture modal |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/attachments/AttachmentUpload.tsx` | Add camera button, integrate modal |
| `src/index.css` | Modal animation if needed |

---

## Testing Checklist

### Mobile
- [ ] Camera button visible
- [ ] Tap opens native camera
- [ ] Take photo → returns to app
- [ ] Photo appears as attachment
- [ ] Image is correct orientation (not mirrored)

### Desktop  
- [ ] Camera button visible
- [ ] Click opens modal with live preview
- [ ] Preview is NOT mirrored
- [ ] Capture freezes frame
- [ ] Retake returns to live preview
- [ ] Use Photo attaches image
- [ ] Modal closes and cleans up stream
- [ ] Close button stops camera

### Error States
- [ ] No camera → shows error message
- [ ] Permission denied → shows instructions
- [ ] Try Again re-requests permission

---

## Out of Scope (V2)

- Multiple photo capture in sequence
- Photo editing (crop, rotate)
- OCR text extraction from receipts
- Auto-categorization of receipt data
- Camera flash control
- Resolution/quality settings
