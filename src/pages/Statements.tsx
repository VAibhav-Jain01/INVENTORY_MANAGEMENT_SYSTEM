import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  FileBarChart2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";

/* -------------------------------------------------
   Types
------------------------------------------------- */

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit_price: number;
}

interface Bill {
  id: string;
  bill_number: string;
  customer_name: string | null;
  created_at: string;
  total: number;
  status: string | null;
}

interface BillItem {
  bill_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Transaction {
  date: string;
  billNumber: string;
  customerName: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface ProductSummary {
  productName: string;
  sku: string;
  category: string;
  quantitySold: number;
  salesAmount: number;
}

/* -------------------------------------------------
   Helpers
------------------------------------------------- */

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDate = (dateString: string) => {
  if (!dateString) return "-";

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return `${day}/${month}/${year}`;
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const escapeCsvValue = (value: unknown) => {
  const stringValue = String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const escapeHtml = (value: unknown) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const pdfThStyle =
  "border:1px solid #d1d5db;padding:7px;text-align:left;background:#f3f4f6;font-weight:bold;";

/* -------------------------------------------------
   Component
------------------------------------------------- */

const Statements = () => {
  const { user } = useAuth();

  const today = getLocalDateString();

  const [products, setProducts] = useState<Product[]>([]);
  const [firstBillDate, setFirstBillDate] = useState<string>(today);

  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const [productSummary, setProductSummary] = useState<ProductSummary[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [totalQuantity, setTotalQuantity] = useState<number>(0);
  const [totalSales, setTotalSales] = useState<number>(0);

  const [generating, setGenerating] = useState<boolean>(false);
  const [loadingInitialData, setLoadingInitialData] = useState<boolean>(true);

  /* -------------------------------------------------
     Load products + earliest bill date
  ------------------------------------------------- */

  const loadInitialData = useCallback(async () => {
    if (!user) return;

    setLoadingInitialData(true);

    try {
      const [productsResponse, firstBillResponse] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, sku, category, unit_price")
          .eq("user_id", user.id)
          .order("name", { ascending: true }),

        supabase
          .from("bills")
          .select("created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1),
      ]);

      if (productsResponse.error) throw productsResponse.error;
      if (firstBillResponse.error) throw firstBillResponse.error;

      setProducts((productsResponse.data || []) as Product[]);

      let earliestDate = today;

      if (
        firstBillResponse.data &&
        firstBillResponse.data.length > 0 &&
        firstBillResponse.data[0]?.created_at
      ) {
        earliestDate = getLocalDateString(
          new Date(firstBillResponse.data[0].created_at)
        );
      }

      setFirstBillDate(earliestDate);
      setFromDate(earliestDate);
      setToDate(today);
    } catch (error) {
      console.error("Error loading statement data:", error);

      toast({
        title: "Error",
        description: "Failed to load statement data.",
        variant: "destructive",
      });
    } finally {
      setLoadingInitialData(false);
    }
  }, [user, today]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  /* -------------------------------------------------
     Generate Statement
  ------------------------------------------------- */

  const generateStatement = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to generate a statement.",
        variant: "destructive",
      });
      return;
    }

    if (!fromDate || !toDate) {
      toast({
        title: "Select dates",
        description: "Please select both From Date and To Date.",
        variant: "destructive",
      });
      return;
    }

    if (fromDate < firstBillDate) {
      toast({
        title: "Invalid From Date",
        description: `The statement cannot start before ${formatDate(
          firstBillDate
        )}.`,
        variant: "destructive",
      });
      return;
    }

    if (toDate > today) {
      toast({
        title: "Invalid To Date",
        description: "The statement cannot include future dates.",
        variant: "destructive",
      });
      return;
    }

    if (fromDate > toDate) {
      toast({
        title: "Invalid date range",
        description: "From Date cannot be after To Date.",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);

    try {
      const start = new Date(`${fromDate}T00:00:00`);
      const endExclusive = new Date(`${toDate}T00:00:00`);
      endExclusive.setDate(endExclusive.getDate() + 1);

      let billsQuery = supabase
        .from("bills")
        .select("id, bill_number, customer_name, created_at, total, status")
        .eq("user_id", user.id)
        .gte("created_at", start.toISOString())
        .lt("created_at", endExclusive.toISOString());

      if (selectedStatus === "all") {
        billsQuery = billsQuery.or("status.neq.cancelled,status.is.null");
      } else {
        if (selectedStatus === "cancelled") {
          setProductSummary([]);
          setTransactions([]);
          setTotalQuantity(0);
          setTotalSales(0);

          toast({
            title: "Cancelled bills excluded",
            description: "Cancelled bills are not included in statements.",
          });

          return;
        }

        billsQuery = billsQuery.eq("status", selectedStatus);
      }

      const { data: billsData, error: billsError } = await billsQuery;

      if (billsError) throw billsError;

      const bills = (billsData || []) as Bill[];

      if (bills.length === 0) {
        setProductSummary([]);
        setTransactions([]);
        setTotalQuantity(0);
        setTotalSales(0);

        toast({
          title: "No data found",
          description:
            "No non-cancelled bills were found for the selected filters.",
        });

        return;
      }

      const billIds = bills.map((bill) => bill.id);

      const { data: billItemsData, error: billItemsError } = await supabase
        .from("bill_items")
        .select(
          "bill_id, product_id, product_name, quantity, unit_price, total"
        )
        .in("bill_id", billIds);

      if (billItemsError) throw billItemsError;

      const billItems = (billItemsData || []) as BillItem[];

      const filteredItems =
        selectedProduct === "all"
          ? billItems
          : billItems.filter((item) => item.product_id === selectedProduct);

      const billMap = new Map<string, Bill>();
      bills.forEach((bill) => {
        billMap.set(bill.id, bill);
      });

      const productMap = new Map<string, ProductSummary>();
      const transactionList: Transaction[] = [];

      let quantityTotal = 0;
      let salesTotal = 0;

      filteredItems.forEach((item) => {
        const bill = billMap.get(item.bill_id);
        if (!bill) return;

        const normalizedName = item.product_name.trim().toLowerCase();
        const key = item.product_id
          ? `product:${item.product_id}`
          : `name:${normalizedName}`;

        const product = item.product_id
          ? products.find((p) => p.id === item.product_id)
          : undefined;

        const existing = productMap.get(key);

        if (existing) {
          existing.quantitySold += Number(item.quantity) || 0;
          existing.salesAmount += Number(item.total) || 0;
        } else {
          productMap.set(key, {
            productName: product?.name || item.product_name,
            sku: product?.sku || "-",
            category: product?.category || "-",
            quantitySold: Number(item.quantity) || 0,
            salesAmount: Number(item.total) || 0,
          });
        }

        const quantity = Number(item.quantity) || 0;
        const amount = Number(item.total) || 0;
        const unitPrice = Number(item.unit_price) || 0;

        quantityTotal += quantity;
        salesTotal += amount;

        transactionList.push({
          date: getLocalDateString(new Date(bill.created_at)),
          billNumber: bill.bill_number,
          customerName: bill.customer_name || "Walk-in Customer",
          productName: product?.name || item.product_name,
          sku: product?.sku || "-",
          quantity,
          unitPrice,
          amount,
        });
      });

      const summary = Array.from(productMap.values()).sort(
        (a, b) => b.quantitySold - a.quantitySold
      );

      transactionList.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setProductSummary(summary);
      setTransactions(transactionList);
      setTotalQuantity(quantityTotal);
      setTotalSales(salesTotal);

      toast({
        title: "Statement generated",
        description: `${transactionList.length} transaction items found.`,
      });
    } catch (error) {
      console.error("Error generating statement:", error);

      toast({
        title: "Error",
        description: "Failed to generate the statement.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  /* -------------------------------------------------
     Reset
  ------------------------------------------------- */

  const resetFilters = () => {
    setFromDate(firstBillDate);
    setToDate(today);
    setSelectedProduct("all");
    setSelectedStatus("all");

    setProductSummary([]);
    setTransactions([]);
    setTotalQuantity(0);
    setTotalSales(0);
  };

  /* -------------------------------------------------
     CSV
  ------------------------------------------------- */

  const downloadCSV = () => {
    if (productSummary.length === 0 && transactions.length === 0) {
      toast({
        title: "No data",
        description: "Generate a statement before downloading CSV.",
        variant: "destructive",
      });
      return;
    }

    const selectedProductName =
      selectedProduct === "all"
        ? "All Products"
        : products.find((p) => p.id === selectedProduct)?.name ||
          "Selected Product";

    const selectedStatusName =
      selectedStatus === "all" ? "All Non-Cancelled" : selectedStatus;

    const lines: string[] = [];

    lines.push("STOCKFLOW SALES STATEMENT");
    lines.push(`From Date,${escapeCsvValue(formatDate(fromDate))}`);
    lines.push(`To Date,${escapeCsvValue(formatDate(toDate))}`);
    lines.push(`Product,${escapeCsvValue(selectedProductName)}`);
    lines.push(`Status,${escapeCsvValue(selectedStatusName)}`);
    lines.push("");

    /* Product Summary */
    lines.push("PRODUCT SUMMARY");
    lines.push(
      [
        "Product",
        "SKU",
        "Category",
        "Quantity Sold",
        "Sales Amount",
      ]
        .map(escapeCsvValue)
        .join(",")
    );

    productSummary.forEach((item) => {
      lines.push(
        [
          item.productName,
          item.sku,
          item.category,
          item.quantitySold,
          item.salesAmount.toFixed(2),
        ]
          .map(escapeCsvValue)
          .join(",")
      );
    });

    lines.push("");
    lines.push(`Total Quantity Sold,${totalQuantity}`);
    lines.push(`Total Sales Amount,${totalSales.toFixed(2)}`);
    lines.push("");

    /* Transaction Details */
    lines.push("TRANSACTION DETAILS");
    lines.push(
      [
        "Date",
        "Bill No.",
        "Customer",
        "Product",
        "SKU",
        "Quantity",
        "Unit Price",
        "Amount",
      ]
        .map(escapeCsvValue)
        .join(",")
    );

    transactions.forEach((transaction) => {
      lines.push(
        [
          formatDate(transaction.date),
          transaction.billNumber,
          transaction.customerName,
          transaction.productName,
          transaction.sku,
          transaction.quantity,
          transaction.unitPrice.toFixed(2),
          transaction.amount.toFixed(2),
        ]
          .map(escapeCsvValue)
          .join(",")
      );
    });

    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `statement_${fromDate}_to_${toDate}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    toast({
      title: "CSV downloaded",
      description: "Statement CSV has been downloaded successfully.",
    });
  };

  /* -------------------------------------------------
     PDF 1: Product Summary Only
  ------------------------------------------------- */

  const createPdfContainer = () => {
    const container = document.createElement("div");

    // A4 landscape at 96 CSS px/in, minus 8mm margins on both sides.
    // Keeping the source width fixed prevents html2canvas from cropping
    // the left side when html2pdf converts the canvas to A4.
    const PDF_CONTENT_WIDTH = 1060;

    container.style.position = "absolute";
    container.style.left = "0";
    container.style.top = "0";
    container.style.width = `${PDF_CONTENT_WIDTH}px`;
    container.style.minHeight = "100px";
    container.style.margin = "0";
    container.style.padding = "28px";
    container.style.boxSizing = "border-box";
    container.style.background = "#ffffff";
    container.style.color = "#111827";
    container.style.fontFamily = "Arial, Helvetica, sans-serif";
    container.style.fontSize = "12px";
    container.style.lineHeight = "1.35";
    container.style.visibility = "visible";
    container.style.opacity = "1";
    container.style.display = "block";
    container.style.overflow = "visible";
    container.style.zIndex = "2147483647";

    return container;
  };

  const waitForPdfLayout = async (container: HTMLElement) => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.setTimeout(resolve, 250);
        });
      });
    });

    const rect = container.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      container.scrollWidth <= 0 ||
      container.scrollHeight <= 0
    ) {
      throw new Error("PDF container has invalid layout dimensions.");
    }

    // Make sure the browser has actually laid out the complete content.
    // Reading these properties forces a layout calculation before capture.
    void container.offsetWidth;
    void container.offsetHeight;
  };

  const downloadProductSummaryPDF = async () => {
    if (productSummary.length === 0) {
      toast({
        title: "No data",
        description:
          "Generate a statement before downloading the Product Summary PDF.",
        variant: "destructive",
      });
      return;
    }

    let container: HTMLDivElement | null = null;

    try {
      const module = await import("html2pdf.js");
      const html2pdf: any = module.default || module;

      const selectedProductName =
        selectedProduct === "all"
          ? "All Products"
          : products.find((p) => p.id === selectedProduct)?.name ||
            "Selected Product";

      const selectedStatusName =
        selectedStatus === "all" ? "All Non-Cancelled" : selectedStatus;

      container = createPdfContainer();

      const summaryRows = productSummary
        .map(
          (item) => `
            <tr style="page-break-inside:avoid;">
              <td style="border:1px solid #d1d5db;padding:7px 8px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.productName)}
              </td>
              <td style="border:1px solid #d1d5db;padding:7px 8px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.sku)}
              </td>
              <td style="border:1px solid #d1d5db;padding:7px 8px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.category)}
              </td>
              <td style="border:1px solid #d1d5db;padding:7px 8px;text-align:right;vertical-align:top;">
                ${item.quantitySold}
              </td>
              <td style="border:1px solid #d1d5db;padding:7px 8px;text-align:right;vertical-align:top;white-space:nowrap;">
                ${formatCurrency(item.salesAmount)}
              </td>
            </tr>
          `
        )
        .join("");

      container.innerHTML = `
        <div style="width:100%;max-width:100%;margin:0;padding:0;background:#ffffff;color:#111827;box-sizing:border-box;">
          <h1 style="margin:0 0 4px;padding:0;font-size:25px;line-height:1.2;font-weight:700;color:#111827;">
            StockFlow Product Sales Summary
          </h1>

          <p style="margin:0 0 18px;padding:0;color:#6b7280;font-size:12px;line-height:1.3;">
            Product-wise sales statement
          </p>

          <table
            style="
              width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              margin:0 0 18px;
              font-size:12px;
            "
          >
            <colgroup>
              <col style="width:50%;" />
              <col style="width:50%;" />
            </colgroup>
            <tbody>
              <tr>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>From Date:</strong> ${escapeHtml(formatDate(fromDate))}
                </td>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>To Date:</strong> ${escapeHtml(formatDate(toDate))}
                </td>
              </tr>
              <tr>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>Product:</strong> ${escapeHtml(selectedProductName)}
                </td>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>Status:</strong> ${escapeHtml(selectedStatusName)}
                </td>
              </tr>
            </tbody>
          </table>

          <table
            style="
              width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              margin:0 0 22px;
            "
          >
            <colgroup>
              <col style="width:33.3333%;" />
              <col style="width:33.3333%;" />
              <col style="width:33.3333%;" />
            </colgroup>
            <tbody>
              <tr>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Products Sold</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${productSummary.length}
                  </div>
                </td>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Total Quantity Sold</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${totalQuantity}
                  </div>
                </td>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Sales Amount</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${formatCurrency(totalSales)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 style="font-size:17px;line-height:1.25;margin:0 0 10px;padding:0;">
            Product Summary
          </h2>

          <table
            style="
              width:100%;
              max-width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              font-size:11px;
              margin:0;
            "
          >
            <colgroup>
              <col style="width:34%;" />
              <col style="width:16%;" />
              <col style="width:20%;" />
              <col style="width:14%;" />
              <col style="width:16%;" />
            </colgroup>

            <thead>
              <tr style="page-break-inside:avoid;">
                <th style="${pdfThStyle}width:34%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  Product
                </th>
                <th style="${pdfThStyle}width:16%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  SKU
                </th>
                <th style="${pdfThStyle}width:20%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  Category
                </th>
                <th style="${pdfThStyle}width:14%;box-sizing:border-box;text-align:right;white-space:normal;">
                  Quantity Sold
                </th>
                <th style="${pdfThStyle}width:16%;box-sizing:border-box;text-align:right;white-space:normal;">
                  Sales Amount
                </th>
              </tr>
            </thead>

            <tbody>
              ${summaryRows}
            </tbody>

            <tfoot>
              <tr style="page-break-inside:avoid;">
                <td colspan="3" style="border:1px solid #d1d5db;padding:7px 8px;font-weight:700;">
                  Total
                </td>
                <td style="border:1px solid #d1d5db;padding:7px 8px;text-align:right;font-weight:700;">
                  ${totalQuantity}
                </td>
                <td style="border:1px solid #d1d5db;padding:7px 8px;text-align:right;font-weight:700;white-space:nowrap;">
                  ${formatCurrency(totalSales)}
                </td>
              </tr>
            </tfoot>
          </table>

          <p style="margin:18px 0 0;padding:0;font-size:9px;line-height:1.3;color:#6b7280;">
            Cancelled bills are excluded from this statement.
          </p>
        </div>
      `;

      document.body.appendChild(container);

      await waitForPdfLayout(container);

      const canvasWidth = container.scrollWidth;
      const canvasHeight = container.scrollHeight;

      console.log("Product PDF layout:", {
        width: canvasWidth,
        height: canvasHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
      });

      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `product_summary_${fromDate}_to_${toDate}.pdf`,
          image: {
            type: "jpeg",
            quality: 0.98,
          },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
            logging: false,
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            scrollX: 0,
            scrollY: 0,
            windowWidth: canvasWidth,
            windowHeight: Math.max(window.innerHeight, canvasHeight),
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "landscape",
            compress: true,
          },
          pagebreak: {
            mode: ["css", "legacy"],
            before: ".pdf-page-break",
            avoid: ["tr", "thead", "tfoot"],
          },
        })
        .from(container)
        .toCanvas()
        .toPdf()
        .save();

      toast({
        title: "Product Summary PDF downloaded",
        description: "Only the Product Summary has been included.",
      });
    } catch (error) {
      console.error("Product Summary PDF error:", error);

      toast({
        title: "PDF error",
        description: "Failed to generate the Product Summary PDF.",
        variant: "destructive",
      });
    } finally {
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };

  /* -------------------------------------------------
     PDF 2: Transaction Details Only
  ------------------------------------------------- */

  const downloadTransactionSummaryPDF = async () => {
    if (transactions.length === 0) {
      toast({
        title: "No data",
        description:
          "Generate a statement before downloading the Transaction Summary PDF.",
        variant: "destructive",
      });
      return;
    }

    let container: HTMLDivElement | null = null;

    try {
      const module = await import("html2pdf.js");
      const html2pdf: any = module.default || module;

      const selectedProductName =
        selectedProduct === "all"
          ? "All Products"
          : products.find((p) => p.id === selectedProduct)?.name ||
            "Selected Product";

      const selectedStatusName =
        selectedStatus === "all" ? "All Non-Cancelled" : selectedStatus;

      container = createPdfContainer();

      const transactionRows = transactions
        .map(
          (item) => `
            <tr style="page-break-inside:avoid;">
              <td style="border:1px solid #d1d5db;padding:6px 5px;vertical-align:top;white-space:nowrap;">
                ${escapeHtml(formatDate(item.date))}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.billNumber)}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.customerName)}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.productName)}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                ${escapeHtml(item.sku)}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;text-align:right;vertical-align:top;white-space:nowrap;">
                ${item.quantity}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;text-align:right;vertical-align:top;white-space:nowrap;">
                ${formatCurrency(item.unitPrice)}
              </td>
              <td style="border:1px solid #d1d5db;padding:6px 5px;text-align:right;vertical-align:top;white-space:nowrap;">
                ${formatCurrency(item.amount)}
              </td>
            </tr>
          `
        )
        .join("");

      container.innerHTML = `
        <div style="width:100%;max-width:100%;margin:0;padding:0;background:#ffffff;color:#111827;box-sizing:border-box;">
          <h1 style="margin:0 0 4px;padding:0;font-size:25px;line-height:1.2;font-weight:700;color:#111827;">
            StockFlow Transaction Summary
          </h1>

          <p style="margin:0 0 18px;padding:0;color:#6b7280;font-size:12px;line-height:1.3;">
            Detailed sales transaction statement
          </p>

          <table
            style="
              width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              margin:0 0 18px;
              font-size:12px;
            "
          >
            <colgroup>
              <col style="width:50%;" />
              <col style="width:50%;" />
            </colgroup>
            <tbody>
              <tr>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>From Date:</strong> ${escapeHtml(formatDate(fromDate))}
                </td>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>To Date:</strong> ${escapeHtml(formatDate(toDate))}
                </td>
              </tr>
              <tr>
                <td style="padding:3px 0;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">
                  <strong>Product:</strong> ${escapeHtml(selectedProductName)}
                </td>
                <td style="padding:3px 0;vertical-align:top;">
                  <strong>Status:</strong> ${escapeHtml(selectedStatusName)}
                </td>
              </tr>
            </tbody>
          </table>

          <table
            style="
              width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              margin:0 0 22px;
            "
          >
            <colgroup>
              <col style="width:33.3333%;" />
              <col style="width:33.3333%;" />
              <col style="width:33.3333%;" />
            </colgroup>
            <tbody>
              <tr>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Transaction Items</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${transactions.length}
                  </div>
                </td>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Total Quantity</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${totalQuantity}
                  </div>
                </td>
                <td style="border:1px solid #d1d5db;padding:11px;vertical-align:top;">
                  <div style="color:#6b7280;font-size:11px;">Total Sales</div>
                  <div style="font-size:19px;font-weight:700;margin-top:3px;">
                    ${formatCurrency(totalSales)}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 style="font-size:17px;line-height:1.25;margin:0 0 10px;padding:0;">
            Transaction Details
          </h2>

          <table
            style="
              width:100%;
              max-width:100%;
              table-layout:fixed;
              border-collapse:collapse;
              border-spacing:0;
              font-size:9.5px;
              margin:0;
            "
          >
            <colgroup>
              <col style="width:11%;" />
              <col style="width:10%;" />
              <col style="width:17%;" />
              <col style="width:19%;" />
              <col style="width:10%;" />
              <col style="width:7%;" />
              <col style="width:13%;" />
              <col style="width:13%;" />
            </colgroup>

            <thead>
              <tr style="page-break-inside:avoid;">
                <th style="${pdfThStyle}width:11%;box-sizing:border-box;white-space:nowrap;">
                  Date
                </th>
                <th style="${pdfThStyle}width:10%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  Bill No.
                </th>
                <th style="${pdfThStyle}width:17%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  Customer
                </th>
                <th style="${pdfThStyle}width:19%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  Product
                </th>
                <th style="${pdfThStyle}width:10%;box-sizing:border-box;word-break:break-word;overflow-wrap:anywhere;">
                  SKU
                </th>
                <th style="${pdfThStyle}width:7%;box-sizing:border-box;text-align:right;">
                  Qty
                </th>
                <th style="${pdfThStyle}width:13%;box-sizing:border-box;text-align:right;white-space:normal;">
                  Unit Price
                </th>
                <th style="${pdfThStyle}width:13%;box-sizing:border-box;text-align:right;white-space:normal;">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody>
              ${transactionRows}
            </tbody>

            <tfoot>
              <tr style="page-break-inside:avoid;">
                <td colspan="5" style="border:1px solid #d1d5db;padding:6px;font-weight:700;">
                  Total
                </td>
                <td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-weight:700;">
                  ${totalQuantity}
                </td>
                <td style="border:1px solid #d1d5db;padding:6px;"></td>
                <td style="border:1px solid #d1d5db;padding:6px;text-align:right;font-weight:700;white-space:nowrap;">
                  ${formatCurrency(totalSales)}
                </td>
              </tr>
            </tfoot>
          </table>

          <p style="margin:18px 0 0;padding:0;font-size:9px;line-height:1.3;color:#6b7280;">
            Cancelled bills are excluded from this statement.
          </p>
        </div>
      `;

      document.body.appendChild(container);

      await waitForPdfLayout(container);

      const canvasWidth = container.scrollWidth;
      const canvasHeight = container.scrollHeight;

      console.log("Transaction PDF layout:", {
        width: canvasWidth,
        height: canvasHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
      });

      await html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: `transaction_summary_${fromDate}_to_${toDate}.pdf`,
          image: {
            type: "jpeg",
            quality: 0.98,
          },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: "#ffffff",
            logging: false,
            x: 0,
            y: 0,
            width: canvasWidth,
            height: canvasHeight,
            scrollX: 0,
            scrollY: 0,
            windowWidth: canvasWidth,
            windowHeight: Math.max(window.innerHeight, canvasHeight),
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "landscape",
            compress: true,
          },
          pagebreak: {
            mode: ["css", "legacy"],
            before: ".pdf-page-break",
            avoid: ["tr", "thead", "tfoot"],
          },
        })
        .from(container)
        .toCanvas()
        .toPdf()
        .save();

      toast({
        title: "Transaction Summary PDF downloaded",
        description: "Only the Transaction Details have been included.",
      });
    } catch (error) {
      console.error("Transaction PDF error:", error);

      toast({
        title: "PDF error",
        description: "Failed to generate the Transaction Summary PDF.",
        variant: "destructive",
      });
    } finally {
      if (container?.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };

  /* -------------------------------------------------
     Loading
  ------------------------------------------------- */

  if (loadingInitialData) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-muted-foreground">Loading statements...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  /* -------------------------------------------------
     UI
  ------------------------------------------------- */

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <FileBarChart2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Statements</h1>
                <p className="text-muted-foreground">
                  Analyze your product sales for any date range.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Statement Filters</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              {/* From Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">From Date</label>
                <Input
                  type="date"
                  value={fromDate}
                  min={firstBillDate}
                  max={today}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFromDate(value);
                    if (toDate && value > toDate) {
                      setToDate(value);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Earliest: {formatDate(firstBillDate)}
                </p>
              </div>

              {/* To Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium">To Date</label>
                <Input
                  type="date"
                  value={toDate}
                  min={fromDate || firstBillDate}
                  max={today}
                  onChange={(e) => {
                    setToDate(e.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Latest: {formatDate(today)}
                </p>
              </div>

              {/* Product */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Product</label>
                <Select
                  value={selectedProduct}
                  onValueChange={setSelectedProduct}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Bill Status</label>
                <Select
                  value={selectedStatus}
                  onValueChange={setSelectedStatus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Non-Cancelled</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Buttons */}
              <div className="flex items-end gap-2">
                <Button
                  onClick={generateStatement}
                  disabled={generating}
                  className="flex-1"
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileBarChart2 className="mr-2 h-4 w-4" />
                      Generate
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={resetFilters}
                  title="Reset filters"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {(productSummary.length > 0 || transactions.length > 0) && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Products Sold</p>
                  <p className="mt-2 text-2xl font-bold">
                    {productSummary.length}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">
                    Total Quantity Sold
                  </p>
                  <p className="mt-2 text-2xl font-bold">{totalQuantity}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">Sales Amount</p>
                  <p className="mt-2 text-2xl font-bold">
                    {formatCurrency(totalSales)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground">
                    Transaction Items
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {transactions.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Export Buttons */}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={downloadCSV}
                disabled={
                  productSummary.length === 0 && transactions.length === 0
                }
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download CSV
              </Button>

              <Button
                variant="outline"
                onClick={downloadProductSummaryPDF}
                disabled={productSummary.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Product Summary PDF
              </Button>

              <Button
                variant="outline"
                onClick={downloadTransactionSummaryPDF}
                disabled={transactions.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Transaction Summary PDF
              </Button>
            </div>

            {/* Product Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Product Summary</CardTitle>
              </CardHeader>

              <CardContent>
                {generating ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    <span className="text-muted-foreground">
                      Generating statement...
                    </span>
                  </div>
                ) : productSummary.length === 0 ? (
                  <div className="py-10 text-center text-muted-foreground">
                    No product sales found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left font-medium">
                            Product
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            SKU
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            Category
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Quantity Sold
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Sales Amount
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {productSummary.map((item, index) => (
                          <tr
                            key={`${item.productName}-${item.sku}-${index}`}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-3 font-medium">
                              {item.productName}
                            </td>
                            <td className="px-4 py-3">{item.sku}</td>
                            <td className="px-4 py-3">{item.category}</td>
                            <td className="px-4 py-3 text-right">
                              {item.quantitySold}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(item.salesAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>

                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td colSpan={3} className="px-4 py-3 font-semibold">
                            Total
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {totalQuantity}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(totalSales)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction Details */}
            {transactions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Transaction Details</CardTitle>
                </CardHeader>

                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left font-medium">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            Bill No.
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            Customer
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            Product
                          </th>
                          <th className="px-4 py-3 text-left font-medium">
                            SKU
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Qty
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Unit Price
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Amount
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {transactions.map((transaction, index) => (
                          <tr
                            key={`${transaction.billNumber}-${transaction.productName}-${index}`}
                            className="border-b last:border-0"
                          >
                            <td className="px-4 py-3">
                              {formatDate(transaction.date)}
                            </td>
                            <td className="px-4 py-3 font-medium">
                              {transaction.billNumber}
                            </td>
                            <td className="px-4 py-3">
                              {transaction.customerName}
                            </td>
                            <td className="px-4 py-3">
                              {transaction.productName}
                            </td>
                            <td className="px-4 py-3">{transaction.sku}</td>
                            <td className="px-4 py-3 text-right">
                              {transaction.quantity}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(transaction.unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {formatCurrency(transaction.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Empty State */}
        {productSummary.length === 0 &&
          transactions.length === 0 &&
          !generating && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <FileBarChart2 className="h-7 w-7 text-primary" />
                </div>

                <h2 className="text-lg font-semibold">
                  Generate a Sales Statement
                </h2>

                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Select a date range and optional filters to view the quantity
                  of goods sold and detailed sales transactions.
                </p>

                <p className="mt-2 text-xs text-muted-foreground">
                  Available dates: {formatDate(firstBillDate)} to{" "}
                  {formatDate(today)}
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </DashboardLayout>
  );
};

export default Statements;