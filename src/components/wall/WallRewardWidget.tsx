export function WallRewardWidget() {
    return (
        <div className="flex flex-col flex-1 pl-4 pr-12 border-r border-white/10">
            <div className="text-[1.2rem] font-black uppercase tracking-widest text-white mb-4 font-display">
                Family Reward
            </div>
            <div className="flex items-center gap-6">
                <div className="flex-1 h-6 rounded-full bg-white/10 overflow-hidden relative shadow-inner">
                    <div className="absolute left-0 top-0 bottom-0 bg-[#F26E63] w-[65%] transition-all duration-1000 origin-left scale-x-100 shadow-[inset_0_-4px_0_rgba(0,0,0,0.1)] rounded-full" />
                </div>
                <span className="text-[3rem] drop-shadow-md">🎬</span>
            </div>
        </div>
    )
}
