'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import ApplyModal from './ApplyModal';

interface ApplyButtonProps {
  jobId: string;
  jobTitle: string;
  department: string;
  accent: string;
}

export default function ApplyButton({ jobId, jobTitle, department, accent }: ApplyButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary btn-lg mt-5 w-full justify-center"
        style={{ background: accent, borderColor: accent }}
      >
        <Send size={16} /> Apply now
      </button>
      <div className="mt-3 text-[11px] text-dim text-center">
        Your CV is screened by AI for fit and risk.
      </div>
      {open && (
        <ApplyModal
          jobId={jobId}
          jobTitle={jobTitle}
          department={department}
          accent={accent}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
