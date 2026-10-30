/**
 * Biblioteca de primitivos do ViT.
 *
 * Regra: as páginas importam daqui, nunca de arquivos individuais.
 *   import { Button, Table, Field, useToast } from "../ui";
 *
 * O CSS vive em src/styles/ui.css e é importado uma vez no main.jsx.
 */

export { default as Button } from "./Button";
export { default as Card } from "./Card";
export { default as Badge } from "./Badge";
export { default as Stat } from "./Stat";
export { default as PageHeader } from "./PageHeader";
export { default as Skeleton } from "./Skeleton";
export { default as Ocupado } from "./Ocupado";
export { default as EmptyState } from "./EmptyState";

export { default as Field } from "./Field";
export { default as Input } from "./Input";
export { default as CampoSenha } from "./CampoSenha";
export { default as Select } from "./Select";
export { default as Textarea } from "./Textarea";
export { default as Checkbox } from "./Checkbox";

export { default as Table } from "./Table";
export { default as Tabs } from "./Tabs";
export { default as Modal } from "./Modal";
export { default as Gaveta } from "./Gaveta";

export { ToastProvider } from "./Toast";
export { useToast } from "./useToast";
export { ConfirmProvider } from "./Confirm";
export { useConfirm } from "./useConfirm";
