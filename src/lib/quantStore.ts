import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface QuantStore {
    latestQuantData: any | null;
    setLatestQuantData: (data: any) => void;
}

export const useQuantStore = create<QuantStore>()(
    persist(
        (set) => ({
            latestQuantData: null,
            setLatestQuantData: (data) => set({ latestQuantData: data }),
        }),
        {
            name: 'quant-dashboard-storage', // name of the item in the storage (must be unique)
            storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
        }
    )
);

// Enable cross-tab synchronization
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === 'quant-dashboard-storage') {
            useQuantStore.persist.rehydrate();
        }
    });
}

// Enable cross-tab synchronization
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
        if (event.key === 'quant-dashboard-storage') {
            useQuantStore.persist.rehydrate();
        }
    });
}