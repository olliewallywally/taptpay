import logo from 'figma:asset/987108cf9c4e186fbd1d468c6f1509d644b9173e.png';

export function Footer() {
  return (
    <footer className="bg-[#001133] border-t border-white/10 px-[5vw]" style={{ paddingTop: 'clamp(2rem, 5vh, 3rem)', paddingBottom: 'clamp(2rem, 5vh, 3rem)' }}>
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center" style={{ gap: 'clamp(1rem, 2vh, 1.5rem)' }}>
          <div className="flex items-center" style={{ gap: 'clamp(0.25rem, 0.5vw, 0.5rem)' }}>
            <img src={logo} alt="taptpay" style={{ height: 'clamp(1.75rem, 3.5vw, 2rem)' }} />
          </div>
          <div className="text-white/40" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
            tap into the future of payments
          </div>
        </div>
      </div>
    </footer>
  );
}
