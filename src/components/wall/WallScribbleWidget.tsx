export function WallScribbleWidget() {
    return (
        <div className="flex flex-col w-[260px] shrink-0">
            <div className="text-[1.2rem] font-black uppercase tracking-widest text-white mb-4 font-display">
                Fun Widgets
            </div>
            <div className="bg-white rounded-3xl p-4 flex flex-col items-center justify-center shadow-xl transform -rotate-2 hover:rotate-0 transition-transform cursor-pointer">
                <div className="text-[3rem] flex flex-wrap justify-center items-center h-[110px] w-full relative">
                    <span className="text-[#F9C35C] absolute top-2 left-6 opacity-80">🖍️</span>
                    <span className="text-[#6DC4A7] absolute bottom-2 left-10 opacity-80">🎨</span>
                    <span className="text-[#F26E63] absolute top-6 right-6 opacity-80">✨</span>
                    <span className="text-[#3B82F6] absolute bottom-4 right-8 opacity-80">🖌️</span>
                </div>
                <span className="text-slate-800 font-extrabold mt-1 text-[1.1rem] tracking-wider uppercase">
                    Scribble Square
                </span>
            </div>
        </div>
    )
}
