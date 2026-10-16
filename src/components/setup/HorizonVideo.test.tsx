import {beforeEach,describe,it,expect,vi} from 'vitest'
import {fireEvent,screen,within} from '@testing-library/react'
import {render} from '@/test/test-utils'
import {HorizonVideoButton,type HorizonVideoId} from './HorizonVideo'
import videos from '@/lib/onboarding/horizonVideos.json'
import examples from '@/lib/onboarding/horizonExamples.json'

beforeEach(()=>{
  vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true})
  vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false})
  vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{})
})
describe('optional horizon examples',()=>{
  it.each(Object.keys(videos) as HorizonVideoId[])('opens the %s film with its own audio, captions and transcript and returns focus on close',async horizon=>{
    const {user}=render(<HorizonVideoButton horizon={horizon}/>)
    expect(document.querySelector('video')).toBeNull()
    const trigger=screen.getByRole('button',{name:new RegExp(`Watch the ${videos[horizon].name} example`)})
    await user.click(trigger)
    const dialog=screen.getByRole('dialog',{name:`${videos[horizon].name}: an example`})
    const media=dialog.querySelector('video')!
    expect(media.querySelector('source')).toHaveAttribute('src',videos[horizon].video)
    expect(media.querySelector('track')).toHaveAttribute('src',videos[horizon].captions)
    expect(media).toHaveAttribute('controls')
    await user.click(within(dialog).getByText('Read the transcript'))
    expect(within(dialog).getByText(examples.find(e=>e.id===horizon)!.narration[0])).toBeVisible()
    await user.click(within(dialog).getByRole('button',{name:'Close video'}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })
  it('keeps the example readable if playback fails and handles Escape',async()=>{
    const {user}=render(<HorizonVideoButton horizon="season"/>)
    await user.click(screen.getByRole('button',{name:/Watch the Season/}))
    const dialog=screen.getByRole('dialog')
    fireEvent.error(dialog.querySelector('video')!)
    expect(screen.getByRole('alert')).toHaveTextContent('video couldn’t load')
    expect(dialog.querySelector('details')).toHaveAttribute('open')
    fireEvent(dialog,new Event('cancel',{bubbles:false,cancelable:true}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
