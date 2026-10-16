import {describe,it,expect,vi} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
vi.mock('@/components/settings/DisplaysSection',()=>({DisplaysSection:()=> <div>Secure pairing controls</div>}))
import {DeviceSetup} from './DeviceSetup'
describe('device onboarding',()=>{
  it('keeps personal installation separate from the shared identity',()=>{
    render(<DeviceSetup/>);expect(screen.queryByText('Secure pairing controls')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/My phone, tablet or computer/}))
    expect(screen.getByRole('region',{name:'Personal device setup'})).toHaveTextContent('same account')
    expect(screen.queryByText('Secure pairing controls')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:/A shared household display/}))
    expect(screen.getByRole('region',{name:'Shared display setup'})).toHaveTextContent('Sign out of any personal')
    expect(screen.getByText('Secure pairing controls')).toBeInTheDocument()
    expect(screen.queryByText(/paired successfully/i)).not.toBeInTheDocument()
  })
  it('offers platform instructions without claiming an installation',()=>{
    render(<DeviceSetup/>);fireEvent.click(screen.getByRole('button',{name:/My phone, tablet or computer/}))
    fireEvent.click(screen.getByRole('button',{name:'Android phone or tablet'}))
    expect(screen.getByRole('link',{name:'Google’s installation guide'})).toHaveAttribute('href',expect.stringContaining('support.google.com'))
    expect(screen.getByText(/browser handles installation/)).toBeInTheDocument()
  })
})
