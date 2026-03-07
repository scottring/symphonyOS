/**
 * iOS Weather-style animated effects overlay.
 * Pure CSS animations — no canvas, no JS animation loops.
 * Effects should be CLEARLY VISIBLE — not subtle background hints.
 */

type WeatherType = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'
type TimeOfDay = 'day' | 'night'

function getWeatherType(code: number): WeatherType {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly-cloudy'
  if (code === 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67) return 'rain'
  if (code <= 77) return 'snow'
  if (code <= 82) return 'rain'
  if (code <= 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'cloudy'
}

function RainEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes rain-fall {
          0% { transform: translateY(-100%) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.8; }
          100% { transform: translateY(1100px) translateX(-50px); opacity: 0; }
        }
        .rain-drop {
          position: absolute;
          top: -20px;
          width: 2px;
          background: linear-gradient(180deg, transparent 0%, rgba(174,194,224,0.5) 50%, rgba(174,194,224,0.9) 100%);
          border-radius: 0 0 2px 2px;
          animation: rain-fall linear infinite;
        }
      `}</style>
      {Array.from({ length: 100 }, (_, i) => (
        <div
          key={i}
          className="rain-drop"
          style={{
            left: `${(i / 100) * 100 + (Math.sin(i * 7) * 2)}%`,
            height: `${20 + (i % 5) * 8}px`,
            animationDuration: `${0.7 + (i % 7) * 0.12}s`,
            animationDelay: `${(i % 13) * 0.1}s`,
            opacity: 0.5 + (i % 3) * 0.15,
          }}
        />
      ))}
    </div>
  )
}

function StormEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes rain-fall-heavy {
          0% { transform: translateY(-100%) translateX(0); opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 0.9; }
          100% { transform: translateY(1100px) translateX(-80px); opacity: 0; }
        }
        .rain-drop-heavy {
          position: absolute;
          top: -20px;
          width: 2.5px;
          background: linear-gradient(180deg, transparent 0%, rgba(160,180,220,0.6) 50%, rgba(160,180,220,1) 100%);
          border-radius: 0 0 2px 2px;
          animation: rain-fall-heavy linear infinite;
        }
        @keyframes lightning-flash {
          0%, 100% { opacity: 0; }
          1% { opacity: 0.9; }
          2.5% { opacity: 0; }
          3.5% { opacity: 0.6; }
          5% { opacity: 0; }
        }
        .lightning {
          animation: lightning-flash 7s ease-in-out infinite;
        }
      `}</style>
      {Array.from({ length: 150 }, (_, i) => (
        <div
          key={i}
          className="rain-drop-heavy"
          style={{
            left: `${(i / 150) * 100 + (Math.sin(i * 5) * 2)}%`,
            height: `${24 + (i % 5) * 10}px`,
            animationDuration: `${0.5 + (i % 5) * 0.08}s`,
            animationDelay: `${(i % 17) * 0.06}s`,
            opacity: 0.5 + (i % 3) * 0.15,
          }}
        />
      ))}
      <div className="lightning absolute inset-0 bg-white/20" style={{ animationDelay: '0s' }} />
      <div className="lightning absolute inset-0 bg-white/15" style={{ animationDelay: '4s' }} />
      <div className="lightning absolute inset-0 bg-white/10" style={{ animationDelay: '9s' }} />
    </div>
  )
}

function SnowEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes snow-fall {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.9; }
          100% { transform: translateY(1100px) translateX(100px) rotate(360deg); opacity: 0; }
        }
        .snowflake {
          position: absolute;
          top: -10px;
          border-radius: 50%;
          background: rgba(255,255,255,0.9);
          box-shadow: 0 0 4px rgba(255,255,255,0.4);
          animation: snow-fall linear infinite;
        }
      `}</style>
      {Array.from({ length: 80 }, (_, i) => {
        const size = 3 + (i % 5) * 2
        return (
          <div
            key={i}
            className="snowflake"
            style={{
              left: `${(i / 80) * 100 + Math.sin(i * 3) * 3}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${4 + (i % 8) * 1.5}s`,
              animationDelay: `${(i % 11) * 0.6}s`,
              opacity: 0.5 + (i % 3) * 0.2,
            }}
          />
        )
      })}
    </div>
  )
}

function CloudsEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes cloud-drift {
          0% { transform: translateX(-400px); }
          100% { transform: translateX(2200px); }
        }
        .cloud-blob {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.08);
          filter: blur(40px);
          animation: cloud-drift linear infinite;
        }
      `}</style>
      {[
        { top: '2%', width: 600, height: 180, duration: 80, delay: 0, opacity: 0.12 },
        { top: '10%', width: 500, height: 150, duration: 100, delay: 15, opacity: 0.1 },
        { top: '5%', width: 700, height: 200, duration: 120, delay: 40, opacity: 0.14 },
        { top: '18%', width: 450, height: 130, duration: 90, delay: 55, opacity: 0.09 },
        { top: '8%', width: 550, height: 160, duration: 110, delay: 25, opacity: 0.11 },
        { top: '14%', width: 650, height: 190, duration: 95, delay: 65, opacity: 0.13 },
        { top: '22%', width: 400, height: 120, duration: 105, delay: 35, opacity: 0.08 },
      ].map((c, i) => (
        <div
          key={i}
          className="cloud-blob"
          style={{
            top: c.top,
            width: `${c.width}px`,
            height: `${c.height}px`,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            opacity: c.opacity,
          }}
        />
      ))}
    </div>
  )
}

function FogEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes fog-drift-1 {
          0%, 100% { transform: translateX(-8%) scaleX(1); opacity: 0.15; }
          50% { transform: translateX(8%) scaleX(1.15); opacity: 0.3; }
        }
        @keyframes fog-drift-2 {
          0%, 100% { transform: translateX(6%) scaleX(1.1); opacity: 0.12; }
          50% { transform: translateX(-6%) scaleX(1); opacity: 0.25; }
        }
      `}</style>
      {[
        { top: '10%', height: '25%', anim: 'fog-drift-1', duration: 20, delay: 0, color: 'rgba(180,190,200,0.3)' },
        { top: '30%', height: '30%', anim: 'fog-drift-2', duration: 25, delay: 5, color: 'rgba(180,190,200,0.35)' },
        { top: '50%', height: '28%', anim: 'fog-drift-1', duration: 22, delay: 10, color: 'rgba(170,180,190,0.3)' },
        { top: '65%', height: '25%', anim: 'fog-drift-2', duration: 28, delay: 3, color: 'rgba(180,190,200,0.25)' },
        { top: '80%', height: '20%', anim: 'fog-drift-1', duration: 18, delay: 12, color: 'rgba(190,200,210,0.2)' },
      ].map((f, i) => (
        <div
          key={i}
          className="absolute left-[-10%] right-[-10%]"
          style={{
            top: f.top,
            height: f.height,
            background: `linear-gradient(90deg, transparent 0%, ${f.color} 25%, ${f.color} 50%, ${f.color} 75%, transparent 100%)`,
            filter: 'blur(50px)',
            animation: `${f.anim} ${f.duration}s ease-in-out infinite`,
            animationDelay: `${f.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

function ClearDayEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes sun-pulse {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.1); opacity: 0.4; }
        }
        @keyframes sun-rays {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes sun-haze {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.15; }
        }
      `}</style>
      {/* Warm haze across top */}
      <div
        className="absolute top-0 left-0 right-0 h-[40%]"
        style={{
          background: 'linear-gradient(180deg, rgba(255,200,80,0.12) 0%, transparent 100%)',
          animation: 'sun-haze 10s ease-in-out infinite',
        }}
      />
      {/* Sun glow */}
      <div
        className="absolute -top-[150px] -right-[50px] w-[700px] h-[700px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,220,100,0.3) 0%, rgba(255,180,50,0.12) 30%, rgba(255,150,30,0.04) 50%, transparent 70%)',
          animation: 'sun-pulse 8s ease-in-out infinite',
        }}
      />
      {/* Rotating ray ring */}
      <div
        className="absolute -top-[120px] -right-[20px] w-[550px] h-[550px]"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,220,120,0.06) 10deg, transparent 20deg, transparent 30deg, rgba(255,220,120,0.06) 40deg, transparent 50deg, transparent 60deg, rgba(255,220,120,0.06) 70deg, transparent 80deg, transparent 90deg, rgba(255,220,120,0.06) 100deg, transparent 110deg, transparent 120deg, rgba(255,220,120,0.06) 130deg, transparent 140deg, transparent 150deg, rgba(255,220,120,0.06) 160deg, transparent 170deg, transparent 180deg, rgba(255,220,120,0.06) 190deg, transparent 200deg, transparent 210deg, rgba(255,220,120,0.06) 220deg, transparent 230deg, transparent 240deg, rgba(255,220,120,0.06) 250deg, transparent 260deg, transparent 270deg, rgba(255,220,120,0.06) 280deg, transparent 290deg, transparent 300deg, rgba(255,220,120,0.06) 310deg, transparent 320deg, transparent 330deg, rgba(255,220,120,0.06) 340deg, transparent 350deg, transparent 360deg)',
          borderRadius: '50%',
          animation: 'sun-rays 90s linear infinite',
          filter: 'blur(6px)',
        }}
      />
    </div>
  )
}

function ClearNightEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.3); }
        }
        @keyframes twinkle-slow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        @keyframes moon-glow {
          0%, 100% { opacity: 0.08; }
          50% { opacity: 0.15; }
        }
      `}</style>
      {/* Moon glow */}
      <div
        className="absolute -top-[80px] right-[15%] w-[300px] h-[300px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(200,210,240,0.15) 0%, rgba(180,190,220,0.05) 40%, transparent 70%)',
          animation: 'moon-glow 12s ease-in-out infinite',
        }}
      />
      {Array.from({ length: 60 }, (_, i) => {
        const size = 1 + (i % 4)
        return (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${3 + (i * 23.7) % 94}%`,
              top: `${2 + (i * 17.3) % 65}%`,
              width: `${size}px`,
              height: `${size}px`,
              boxShadow: size >= 3 ? '0 0 3px rgba(255,255,255,0.5)' : 'none',
              animation: `${i % 3 === 0 ? 'twinkle-slow' : 'twinkle'} ${2 + (i % 5) * 1.2}s ease-in-out infinite`,
              animationDelay: `${(i % 9) * 0.6}s`,
            }}
          />
        )
      })}
    </div>
  )
}

function PartlyCloudyEffect({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {timeOfDay === 'day' ? <ClearDayEffect /> : <ClearNightEffect />}
      <CloudsEffect />
    </div>
  )
}

interface WeatherEffectsProps {
  weatherCode: number
  hour: number
}

export function WeatherEffects({ weatherCode, hour }: WeatherEffectsProps) {
  const type = getWeatherType(weatherCode)
  const timeOfDay: TimeOfDay = (hour >= 6 && hour < 20) ? 'day' : 'night'

  switch (type) {
    case 'clear':
      return timeOfDay === 'day' ? <ClearDayEffect /> : <ClearNightEffect />
    case 'partly-cloudy':
      return <PartlyCloudyEffect timeOfDay={timeOfDay} />
    case 'cloudy':
      return <CloudsEffect />
    case 'fog':
      return <FogEffect />
    case 'rain':
      return <RainEffect />
    case 'snow':
      return <SnowEffect />
    case 'storm':
      return <StormEffect />
    default:
      return null
  }
}
