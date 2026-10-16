import { useEffect, useState } from 'react'
import { Smartphone, Tablet, Monitor } from 'lucide-react'
import { DisplaysSection } from '@/components/settings/DisplaysSection'

interface InstallPrompt extends Event { prompt:()=>Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}> }
export function DeviceSetup() {
  const [choice,setChoice]=useState<'personal'|'display'|null>(null)
  const [platform,setPlatform]=useState<'apple'|'android'|'computer'>('apple')
  const [prompt,setPrompt]=useState<InstallPrompt|null>(null)
  const [installed,setInstalled]=useState(()=>window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator&{standalone?:boolean}).standalone===true)
  const [status,setStatus]=useState('')
  const [installing,setInstalling]=useState(false)
  const published=window.location.hostname==='app.symphony-os.com'
  useEffect(()=>{
    const ready=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPrompt)}
    const done=()=>{setInstalled(true);setPrompt(null);setStatus('Symphony was added on this device.')}
    window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done)
    return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done)}
  },[])
  async function install(){if(!prompt||installing)return;setInstalling(true);try{await prompt.prompt();const result=await prompt.userChoice;setStatus(result.outcome==='accepted'?'Installation requested. Open the Symphony icon to check it.':'You can add Symphony later.');setPrompt(null)}catch{setStatus('Use your browser’s install or Add to Home Screen menu.')}finally{setInstalling(false)}}
  return <div className="device-setup">
    <p>Symphony already works in this browser. Add it to your own devices for quick access, or give a shared tablet its own household display.</p>
    <div className="onboarding-choices" role="group" aria-label="Device use">
      <button aria-pressed={choice==='personal'} onClick={()=>setChoice('personal')}><Smartphone size={22}/><strong>My phone, tablet or computer</strong><span>My sign-in, my personal and household activities.</span></button>
      <button aria-pressed={choice==='display'} onClick={()=>setChoice('display')}><Tablet size={22}/><strong>A shared household display</strong><span>The family’s day, with its own restricted sign-in.</span></button>
    </div>
    {choice==='personal'&&<section aria-label="Personal device setup" className="onboarding-note">
      <h2>Take the same Symphony with you</h2>
      <p>On your other device, open <strong>app.symphony-os.com</strong> and sign in with the same account. Saved activities follow your account. An unsent message or unsaved draft may stay in the browser where you started it.</p>
      {!published&&<p className="onboarding-muted">This is a local preview. The published address above opens the live app, which may not include these changes yet.</p>}
      <div className="device-platforms" role="group" aria-label="Installation instructions">{(['apple','android','computer'] as const).map(p=><button key={p} aria-pressed={platform===p} onClick={()=>setPlatform(p)}>{p==='apple'?'iPhone or iPad':p==='android'?'Android phone or tablet':'Computer'}</button>)}</div>
      {platform==='apple'&&<><ol><li>Open Symphony in Safari.</li><li>Open the Share menu and choose <strong>Add to Home Screen</strong>. If offered, leave <strong>Open as Web App</strong> on, then tap Add.</li><li>Open the new Symphony icon. Sign in again if asked, then check that you see the same household and saved activities.</li></ol><a className="onboarding-link" href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios" target="_blank" rel="noreferrer">Apple’s installation guide</a></>}
      {platform==='android'&&<><ol><li>Open Symphony in Chrome.</li><li>Open Chrome’s menu, choose <strong>Add to Home screen</strong>, then <strong>Install</strong> if offered.</li><li>Open the Symphony icon and sign in to the same account. Check your household and a saved activity.</li></ol><a className="onboarding-link" href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en" target="_blank" rel="noreferrer">Google’s installation guide</a></>}
      {platform==='computer'&&<><p><Monitor size={18} aria-hidden="true"/> Keep Symphony bookmarked, or use your browser’s install option if offered. On a Mac, Safari also offers File → Add to Dock.</p><p>Open it once and check your saved activities before closing your original session.</p></>}
      {installed?<p role="status">Symphony is already open as an app on this device.</p>:prompt&&published?<button className="btn-primary" disabled={installing} onClick={()=>void install()}>Install on this device</button>:<p className="onboarding-muted">The browser handles installation. You can keep using Symphony here without installing it.</p>}
      {status&&<p role="status">{status}</p>}
      <p>Use a separate account and household invitation for another adult. Do not share your password. An internet connection is needed for chat and confirmed saves.</p>
    </section>}
    {choice==='display'&&<section aria-label="Shared display setup" className="onboarding-note">
      <h2>A household screen, not someone’s open account</h2>
      <ol><li>On the tablet, add Symphony to its Home Screen if you want an app icon. Open that icon before pairing, because the browser and installed app may keep separate sign-ins.</li><li>Sign out of any personal Symphony account on the tablet. Open <strong>{published?'app.symphony-os.com/wall-v2':`${window.location.host}/wall-v2`}</strong> in the app or browser you will keep using.</li><li>Keep this page on your own device. Make a pairing code below and enter it on the tablet within ten minutes.</li><li>Check that the tablet shows the right household. Use <strong>Check paired displays</strong> below to confirm its connection.</li></ol>
      {!published&&<p className="onboarding-muted">A second device cannot reach a localhost preview. Test pairing on the published app or a reachable test address; do not enter a test code on a real household’s screen.</p>}
      <DisplaysSection/>
      <details className="routine-story-known"><summary>Keep it on the household screen</summary><p>After pairing, you can use iPad Guided Access or Android app pinning to keep the device in Symphony. Keep the exit passcode with an adult. These device settings do not replace Symphony’s restricted display sign-in.</p><p><a className="onboarding-link" href="https://support.apple.com/en-us/111795" target="_blank" rel="noreferrer">iPad Guided Access</a> · <a className="onboarding-link" href="https://support.google.com/android/answer/9455138?hl=en" target="_blank" rel="noreferrer">Android app pinning</a></p><p>Keep it powered and connected to Wi-Fi. After sleep or a restart, check that it reconnects and shows current information.</p></details>
      <details className="routine-story-known"><summary>If the tablet is lost, replaced or no longer shared</summary><p>Open Settings → General → Displays on your own device and revoke it. Clear the old tablet’s Symphony website data before giving it away. A replacement tablet needs a new pairing code.</p></details>
    </section>}
  </div>
}
