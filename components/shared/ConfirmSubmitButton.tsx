"use client";

import { useRef, useState } from "react";

import { ConfirmDialog } from "./ConfirmDialog";

type ConfirmSubmitButtonProps = {
  message: string;
  className?: string;
  children: React.ReactNode;
  confirmLabel?: string;
};

export function ConfirmSubmitButton({ message, className, children, confirmLabel = "Confirm" }: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title="Please confirm"
        description={message}
        confirmLabel={confirmLabel}
        variant="danger"
        onConfirm={() => {
          setOpen(false);
          btnRef.current?.closest("form")?.requestSubmit();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
