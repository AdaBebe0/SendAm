import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/imageCompression.js', () => ({ compressImageForUpload: vi.fn() }));
import { compressImageForUpload } from '@/lib/imageCompression.js';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OnboardingWizard from './OnboardingWizard.jsx';

describe('OnboardingWizard Component', () => {
  it('renders step 1 with phone input', () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/Experience 3-step onboarding in 60 seconds/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter your WhatsApp phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/WhatsApp Phone Number/i)).toBeInTheDocument();
  });

  it('allows user to advance to Step 2 (PIN) and Step 3 (Transfer)', async () => {
    render(<OnboardingWizard />);
    
    // Move to step 2
    const nextBtn = screen.getByRole('button', { name: /Next Step/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Set your 4-digit security PIN/i)).toBeInTheDocument();

    // Move to step 3
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    expect(screen.getByText(/Simulate your first transfer/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Transfer Amount \(USDC\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Recipient Phone/i)).toBeInTheDocument();
  });

  it('allows user to navigate back via Back button', () => {
    render(<OnboardingWizard />);
    const nextBtn = screen.getByRole('button', { name: /Next Step/i });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Set your 4-digit security PIN/i)).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);
    expect(screen.getByText(/Enter your WhatsApp phone number/i)).toBeInTheDocument();
  });

  it('executes simulation and displays completion state with reset option', async () => {
    vi.useFakeTimers();
    render(<OnboardingWizard />);

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));

    // Step 3 -> Execute simulation
    const executeBtn = screen.getByRole('button', { name: /Execute Simulation/i });
    fireEvent.click(executeBtn);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/Simulated Onboarding & Transfer Complete!/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Real Wallet on WhatsApp/i)).toBeInTheDocument();

    // Test reset
    const resetBtn = screen.getByRole('button', { name: /Reset Simulation/i });
    fireEvent.click(resetBtn);
    expect(screen.getByText(/Enter your WhatsApp phone number/i)).toBeInTheDocument();

    vi.useRealTimers();
  });
});

describe('OnboardingWizard identity photo upload', () => {
  it('compresses a chosen photo, shows progress, then reports it is ready', async () => {
    compressImageForUpload.mockImplementation(async (_file, { onProgress }) => {
      onProgress(40);
      return new Blob([new Uint8Array(512 * 1024)], { type: 'image/jpeg' });
    });
    render(<OnboardingWizard />);

    const input = screen.getByLabelText(/Identity Document Photo/i);
    const photo = new File(['x'], 'id.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [photo] } });

    expect(compressImageForUpload).toHaveBeenCalledWith(photo, expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(await screen.findByRole('status')).toHaveTextContent('Photo ready to upload (512 KB)');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the compression progress bar while the photo is being processed', async () => {
    let finish;
    compressImageForUpload.mockImplementation(
      (_file, { onProgress }) =>
        new Promise((resolve) => {
          onProgress(35);
          finish = () => resolve(new Blob([new Uint8Array(1024)]));
        }),
    );
    render(<OnboardingWizard />);

    fireEvent.change(screen.getByLabelText(/Identity Document Photo/i), {
      target: { files: [new File(['x'], 'id.jpg', { type: 'image/jpeg' })] },
    });

    const bar = await screen.findByRole('progressbar', { name: /compressing identity photo/i });
    expect(bar).toHaveAttribute('aria-valuenow', '35');

    await act(async () => finish());
    expect(await screen.findByRole('status')).toHaveTextContent('Photo ready to upload');
  });

  it('surfaces a compression failure to the visitor', async () => {
    compressImageForUpload.mockRejectedValue(new Error('Please choose a photo file.'));
    render(<OnboardingWizard />);

    fireEvent.change(screen.getByLabelText(/Identity Document Photo/i), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a photo file.');
  });
});
