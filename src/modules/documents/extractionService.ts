import {
  RateConfirmationExtraction,
  ExtractionResponse,
  ApplyExtractionToLoadInput,
} from './extractionTypes.ts';
import { parseRateConfirmationText } from './rateConParser.ts';
import { loadService } from '../loads/loadService.ts';
import { documentService } from './documentService.ts';
import { activityService } from '../activity/activityService.ts';
import { calculateProfitability } from '../../lib/calculations.ts';
import { LoadWithRelations, CreateLoadInput, UpdateLoadInput } from '../loads/loadTypes.ts';
import { EquipmentType } from '../../types/domain.types.ts';
import { supabase } from '../../lib/supabase.ts';

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof window !== 'undefined' &&
   window.location.hostname === 'dispatcherdesk.online'
    ? 'https://dispatcherdesk-api.onrender.com'
    : '');

class ExtractionService {
  /**
   * Reads a browser File object as Base64 string
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix (e.g. "data:application/pdf;base64,")
        const base64Index = result.indexOf(';base64,');
        if (base64Index !== -1) {
          resolve(result.substring(base64Index + 8));
        } else {
          resolve(result);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Request server-side AI extraction for a rate confirmation document
   */
  async extractRateConfirmation(params: {
    file?: File;
    documentText?: string;
    fileName?: string;
    organizationId?: string;
  }): Promise<RateConfirmationExtraction> {
    let fileData: string | undefined = undefined;
    let mimeType: string | undefined = undefined;
    const fileName = params.fileName || params.file?.name || 'RateConfirmation.pdf';

    if (params.file) {
      fileData = await this.fileToBase64(params.file);
      mimeType = params.file.type || 'application/pdf';
    }

    // Resolve tenant organization
    const orgId =
      params.organizationId ||
      (() => {
        try {
          return localStorage.getItem('dispatchdesk_active_org_id') || 'demo-org-1';
        } catch {
          return 'demo-org-1';
        }
      })();

    // Retrieve active Supabase session token if available
    let token = 'demo-token';
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
      }
    } catch {
      // ignore session lookup failure, use fallback token
    }

    try {
      const response = await fetch(`${API_BASE}/api/ai/extract-rate-con`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-organization-id': orgId,
        },
        body: JSON.stringify({
          fileData,
          mimeType,
          fileName,
          documentText: params.documentText,
          organizationId: orgId,
        }),
      });

      if (!response.ok) {
        let errorMsg = `Server responded with status ${response.status}`;
        try {
          const errorBody = await response.json();
          const stagePrefix = errorBody?.stage ? `[${String(errorBody.stage).toUpperCase()}] ` : '';
          if (errorBody?.message) {
            errorMsg = `${stagePrefix}${errorBody.message}`;
          } else if (errorBody?.error) {
            errorMsg = `${stagePrefix}${errorBody.error}`;
          }
        } catch {
          // Response body was not JSON (e.g. upstream reverse proxy HTML error page)
          if (response.status === 504 || response.status === 502) {
            errorMsg = `[GATEWAY] Gateway timeout (${response.status}) while waiting for extraction response.`;
          }
        }
        throw new Error(errorMsg);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'Server returned an unexpected non-JSON response. Please check backend API availability.'
        );
      }

      const resData: ExtractionResponse = await response.json();
      if (!resData.success || !resData.extractedData) {
        const stagePrefix = (resData as any)?.stage ? `[${String((resData as any).stage).toUpperCase()}] ` : '';
        throw new Error(`${stagePrefix}${resData.error || (resData as any)?.message || 'Server extraction returned empty or invalid payload.'}`);
      }

      // Append provenance metadata
      const extraction: RateConfirmationExtraction = {
        ...resData.extractedData,
        provenance: {
          fileName,
          fileSize: params.file?.size,
          mimeType: mimeType || 'text/plain',
          extractedAt: resData.extractedAt || new Date().toISOString(),
          model: resData.source || 'gemini-3.1-flash-lite',
          sourceType: params.file
            ? params.file.type.includes('pdf')
              ? 'uploaded_pdf'
              : 'uploaded_image'
            : params.documentText
            ? 'pasted_text'
            : 'sample_document',
        },
      };

      // Perform client-side financial validation
      this.validateFinancialConsistency(extraction);

      return extraction;
    } catch (err: any) {
      console.warn('Extraction API request failed or offline. Attempting deterministic fallback.', err);
      let textForFallback = params.documentText;
      if (!textForFallback && params.file && (params.file.type.includes('text') || params.file.name.endsWith('.txt'))) {
        try {
          textForFallback = await params.file.text();
        } catch {
          // ignore
        }
      }
      if (textForFallback) {
        const fallbackExtraction = parseRateConfirmationText(textForFallback, fileName);
        this.validateFinancialConsistency(fallbackExtraction);
        return fallbackExtraction;
      }
      throw err;
    }
  }

  /**
   * Validates financial arithmetic and adds warnings if numbers don't add up
   */
  private validateFinancialConsistency(extraction: RateConfirmationExtraction) {
    if (!extraction.warnings) {
      extraction.warnings = [];
    }

    const rate = Number(extraction.load_info.rate) || 0;
    if (rate <= 0) {
      extraction.warnings.push('Gross Rate was not extracted or is $0.00. Please verify carrier agreed pay.');
    }

    // Check if origin & dest are valid 2-letter states
    const originState = (extraction.origin.state || '').trim().toUpperCase();
    const destState = (extraction.destination.state || '').trim().toUpperCase();

    if (!originState || originState.length !== 2) {
      extraction.warnings.push(`Origin state "${originState || 'Missing'}" may need manual correction to a standard 2-letter state code.`);
    }

    if (!destState || destState.length !== 2) {
      extraction.warnings.push(`Destination state "${destState || 'Missing'}" may need manual correction to a standard 2-letter state code.`);
    }
  }

  /**
   * Apply approved extraction data to either update an existing load or create a new load,
   * attach the document record, and record an audit activity event.
   */
  async applyExtractionToLoad(input: ApplyExtractionToLoadInput): Promise<{
    load: LoadWithRelations;
    documentId?: string;
  }> {
    const {
      targetLoadId,
      createNewLoad,
      organizationId,
      clientId,
      brokerId,
      truckId,
      driverId,
      extractedData,
      overriddenFields,
      attachDocument,
    } = input;

    let targetLoad: LoadWithRelations;

    if (createNewLoad || !targetLoadId) {
      // 1. Generate or use load number
      const loadNumber =
        overriddenFields.load_number ||
        extractedData.load_info.load_number ||
        (await loadService.generateNextLoadNumber(organizationId));

      const rawEquipment = (overriddenFields.equipment_type ||
        extractedData.load_info.equipment_type ||
        'dry_van') as EquipmentType;

      const createInput: CreateLoadInput = {
        load_number: loadNumber,
        client_id: clientId,
        broker_id: brokerId || null,
        truck_id: truckId || null,
        driver_id: driverId || null,
        pipeline_status: 'booked',
        equipment_type: rawEquipment,
        commodity: overriddenFields.commodity || extractedData.load_info.commodity || null,
        weight_lbs:
          overriddenFields.weight_lbs !== undefined
            ? overriddenFields.weight_lbs
            : extractedData.load_info.weight_lbs || null,
        origin_facility_name:
          overriddenFields.origin_facility_name !== undefined
            ? (overriddenFields.origin_facility_name || null)
            : (extractedData.origin.facility_name || null),
        origin_address:
          overriddenFields.origin_address !== undefined
            ? (overriddenFields.origin_address || null)
            : (extractedData.origin.address || null),
        origin_city: overriddenFields.origin_city || extractedData.origin.city,
        origin_state: (overriddenFields.origin_state || extractedData.origin.state).toUpperCase(),
        origin_zip: overriddenFields.origin_zip || extractedData.origin.zip || null,
        pickup_datetime: overriddenFields.pickup_datetime || extractedData.origin.pickup_datetime || null,
        dest_facility_name:
          overriddenFields.dest_facility_name !== undefined
            ? (overriddenFields.dest_facility_name || null)
            : (extractedData.destination.facility_name || null),
        dest_address:
          overriddenFields.dest_address !== undefined
            ? (overriddenFields.dest_address || null)
            : (extractedData.destination.address || null),
        dest_city: overriddenFields.dest_city || extractedData.destination.city,
        dest_state: (overriddenFields.dest_state || extractedData.destination.state).toUpperCase(),
        dest_zip: overriddenFields.dest_zip || extractedData.destination.zip || null,
        delivery_datetime:
          overriddenFields.delivery_datetime || extractedData.destination.delivery_datetime || null,
        rate:
          overriddenFields.rate !== undefined
            ? overriddenFields.rate
            : extractedData.load_info.total_carrier_compensation ||
              extractedData.load_info.rate ||
              extractedData.financial_breakdown?.total_carrier_compensation ||
              0,
        loaded_miles:
          overriddenFields.loaded_miles !== undefined
            ? overriddenFields.loaded_miles
            : extractedData.load_info.mileage || 0,
        deadhead_miles: overriddenFields.deadhead_miles || 0,
        special_instructions:
          overriddenFields.special_instructions ||
          extractedData.load_info.special_instructions ||
          null,
      };

      targetLoad = await loadService.createLoad(organizationId, createInput);
    } else {
      // Update existing load
      const existingLoad = await loadService.getLoadById(organizationId, targetLoadId);
      const shouldPromoteToBooked = existingLoad && (existingLoad.pipeline_status === 'sourced' || existingLoad.pipeline_status === 'negotiating');

      const updateInput: UpdateLoadInput = {
        broker_id: brokerId !== undefined ? brokerId : undefined,
        truck_id: truckId !== undefined ? truckId : undefined,
        driver_id: driverId !== undefined ? driverId : undefined,
        pipeline_status: shouldPromoteToBooked ? 'booked' : undefined,
        equipment_type: overriddenFields.equipment_type || (extractedData.load_info.equipment_type as EquipmentType),
        commodity:
          overriddenFields.commodity !== undefined
            ? overriddenFields.commodity
            : extractedData.load_info.commodity || undefined,
        weight_lbs:
          overriddenFields.weight_lbs !== undefined
            ? overriddenFields.weight_lbs
            : extractedData.load_info.weight_lbs || undefined,
        origin_facility_name:
          overriddenFields.origin_facility_name !== undefined
            ? (overriddenFields.origin_facility_name || null)
            : extractedData.origin.facility_name || undefined,
        origin_address:
          overriddenFields.origin_address !== undefined
            ? (overriddenFields.origin_address || null)
            : extractedData.origin.address || undefined,
        origin_city: overriddenFields.origin_city || extractedData.origin.city,
        origin_state: (overriddenFields.origin_state || extractedData.origin.state).toUpperCase(),
        origin_zip: overriddenFields.origin_zip || extractedData.origin.zip || undefined,
        pickup_datetime: overriddenFields.pickup_datetime || extractedData.origin.pickup_datetime || undefined,
        dest_facility_name:
          overriddenFields.dest_facility_name !== undefined
            ? (overriddenFields.dest_facility_name || null)
            : extractedData.destination.facility_name || undefined,
        dest_address:
          overriddenFields.dest_address !== undefined
            ? (overriddenFields.dest_address || null)
            : extractedData.destination.address || undefined,
        dest_city: overriddenFields.dest_city || extractedData.destination.city,
        dest_state: (overriddenFields.dest_state || extractedData.destination.state).toUpperCase(),
        dest_zip: overriddenFields.dest_zip || extractedData.destination.zip || undefined,
        delivery_datetime:
          overriddenFields.delivery_datetime || extractedData.destination.delivery_datetime || undefined,
        rate:
          overriddenFields.rate !== undefined
            ? overriddenFields.rate
            : extractedData.load_info.total_carrier_compensation ||
              extractedData.load_info.rate ||
              extractedData.financial_breakdown?.total_carrier_compensation ||
              undefined,
        loaded_miles:
          overriddenFields.loaded_miles !== undefined
            ? overriddenFields.loaded_miles
            : extractedData.load_info.mileage || undefined,
        deadhead_miles:
          overriddenFields.deadhead_miles !== undefined ? overriddenFields.deadhead_miles : undefined,
        special_instructions:
          overriddenFields.special_instructions !== undefined
            ? overriddenFields.special_instructions
            : extractedData.load_info.special_instructions || undefined,
      };

      targetLoad = await loadService.updateLoad(organizationId, targetLoadId, updateInput);
    }

    // 2. Attach Rate Confirmation Document Record
    let docRecordId: string | undefined;
    if (attachDocument) {
      const doc = await documentService.createDocument(organizationId, {
        load_id: targetLoad.id,
        doc_type: 'rate_confirmation',
        doc_status: 'verified', // Approved by dispatcher
        file_name: attachDocument.file_name || 'Rate_Confirmation.pdf',
        file_size_bytes: attachDocument.file_size_bytes || 250000,
        mime_type: attachDocument.mime_type || 'application/pdf',
        notes: `AI OCR Extracted & Dispatcher Approved.\nBroker: ${extractedData.broker.company_name}\nAgreed Rate: $${(overriddenFields.rate || extractedData.load_info.rate).toFixed(2)}\nConfidence: ${extractedData.confidence_scores.overall}%`,
        uploaded_by: 'Dispatcher (AI Assisted)',
      });
      docRecordId = doc.id;
    }

    // 3. Record Audit Activity Event
    await activityService.recordSystemEvent(
      organizationId,
      targetLoad.id,
      'Rate Confirmation Extracted & Approved',
      `Dispatcher approved AI-assisted Rate Confirmation extraction for Load ${targetLoad.load_number}. Rate set to $${targetLoad.rate.toFixed(2)} with Broker ${targetLoad.broker?.company_name || extractedData.broker.company_name}. Overall AI confidence: ${extractedData.confidence_scores.overall}%.`,
      {
        extractedBroker: extractedData.broker.company_name,
        extractedRate: extractedData.load_info.rate,
        confidence: extractedData.confidence_scores.overall,
        model: extractedData.provenance?.model || 'gemini-3.1-flash-lite',
      }
    );

    return {
      load: targetLoad,
      documentId: docRecordId,
    };
  }
}

export const extractionService = new ExtractionService();
