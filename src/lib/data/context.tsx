import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DocumentLinks, BookingInput, CustomerInput, DataApi, PartnerInput, RequestInput, ServiceInput, TaskInput } from "./api";

export const PATHS = {
  demo: {
    home: "/demo",
    customers: "/demo/customers",
    customer: "/demo/customers/$id",
    requests: "/demo/requests",
    newTransaction: "/demo/transactions/new",
    transaction: "/demo/transactions/$id",
    bookings: "/demo/bookings",
    booking: "/demo/bookings/$id",
    tasks: "/demo/tasks",
    activity: "/demo/activity",
    documents: "/demo/documents",
    partners: "/demo/partners",
    services: "/demo/services",
    notifications: "/demo/notifications",
    reports: "/demo/reports",
  },
  cloud: {
    home: "/app",
    customers: "/app/customers",
    customer: "/app/customers/$id",
    requests: "/app/requests",
    newTransaction: "/app/transactions/new",
    transaction: "/app/transactions/$id",
    bookings: "/app/bookings",
    booking: "/app/bookings/$id",
    tasks: "/app/tasks",
    activity: "/app/activity",
    documents: "/app/documents",
    partners: "/app/partners",
    services: "/app/services",
    notifications: "/app/notifications",
    reports: "/app/reports",
  },
} as const;

const DataCtx = createContext<DataApi | null>(null);

export function DataProvider({ api, children }: { api: DataApi; children: ReactNode }) {
  return <DataCtx.Provider value={api}>{children}</DataCtx.Provider>;
}

export function useData() {
  const api = useContext(DataCtx);
  if (!api) throw new Error("useData outside DataProvider");
  return api;
}

export function usePaths() {
  return PATHS[useData().mode];
}

export const useCustomers = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "customers"], queryFn: api.listCustomers });
};
export const useRequests = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "requests"], queryFn: api.listRequests });
};
export const usePartners = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "partners"], queryFn: api.listPartners });
};
export const useServices = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "services"], queryFn: api.listServices });
};
export const useMembers = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "members"], queryFn: api.listMembers });
};

function useMut<I, O>(fn: (api: DataApi, input: I) => Promise<O>, success?: string) {
  const api = useData();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => fn(api, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.key] });
      if (success) toast.success(success);
    },
    onError: (e: Error) => toast.error("تعذّر تنفيذ العملية", { description: e.message }),
  });
}

export const useSaveCustomer = () => useMut((a, i: CustomerInput) => a.saveCustomer(i), "تم حفظ العميل");
export const useDeleteCustomer = () => useMut((a, id: string) => a.deleteCustomer(id), "تم حذف العميل");
export const useSaveRequest = () => useMut((a, i: RequestInput) => a.saveRequest(i), "تم حفظ الطلب");
export const useDeleteRequest = () => useMut((a, id: string) => a.deleteRequest(id), "تم حذف الطلب");
export const useSavePartner = () => useMut((a, i: PartnerInput) => a.savePartner(i), "تم حفظ المكتب الشريك");
export const useDeletePartner = () => useMut((a, id: string) => a.deletePartner(id), "تم حذف المكتب الشريك");
export const useAddService = () => useMut((a, i: ServiceInput) => a.addService(i), "تمت إضافة الخدمة");
export const useToggleService = () => useMut((a, i: { id: string; active: boolean }) => a.toggleService(i.id, i.active));
export const useBookings = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "bookings"], queryFn: api.listBookings });
};
export const useTasks = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "tasks"], queryFn: api.listTasks });
};
export const useUpdateService = () => useMut((a, i: ServiceInput & { id: string }) => a.updateService(i), "تم تحديث الخدمة");
export const useSaveBooking = () => useMut((a, i: BookingInput) => a.saveBooking(i), "تم حفظ الحجز");
export const useDeleteBooking = () => useMut((a, id: string) => a.deleteBooking(id), "تم حذف الحجز");
export const useSaveTask = () => useMut((a, i: TaskInput) => a.saveTask(i), "تم حفظ المهمة");
export const useDeleteTask = () => useMut((a, id: string) => a.deleteTask(id), "تم حذف المهمة");
export const useDocuments = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "documents"], queryFn: api.listDocuments });
};
export const useActivity = () => {
  const api = useData();
  return useQuery({ queryKey: [api.key, "activity"], queryFn: api.listActivity });
};
export const useUploadDocument = () => useMut((a, i: { file: File; links: DocumentLinks }) => a.uploadDocument(i.file, i.links), "تم رفع الوثيقة");
export const useDeleteDocument = () => useMut((a, d: import("@/lib/domain").DocumentRow) => a.deleteDocument(d), "تم حذف الوثيقة");
