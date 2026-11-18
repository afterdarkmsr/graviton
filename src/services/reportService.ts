import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  Timestamp,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ActivityReport, ReportReason, ReportStatus } from '../types';

export interface SubmitActivityReportInput {
  activityId: string;
  activityTitle: string;
  reason: ReportReason;
  details?: string;
}

export interface PaginatedReportsResult {
  reports: ActivityReport[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function parseTimestampISO(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export class ReportService {
  private readonly collectionName = 'reports';

  public async submitActivityReport(input: SubmitActivityReportInput): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      throw new Error('Authentication required: You must be signed in to submit a safety report.');
    }

    const activityId = (input.activityId || '').trim();
    if (!activityId || !VALID_ID_REGEX.test(activityId)) {
      throw new Error('Invalid activity selected for reporting.');
    }

    const sanitizedTitle = (input.activityTitle || 'Campus Activity').trim().slice(0, 150) || 'Campus Activity';
    const sanitizedDetails = (input.details || '').trim().slice(0, 1000);

    try {
      const docRef = await addDoc(collection(db, this.collectionName), {
        activityId,
        activityTitle: sanitizedTitle,
        reporterUid: currentUser.uid,
        reason: input.reason,
        details: sanitizedDetails,
        status: 'open' as ReportStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, this.collectionName);
    }
  }

  public async listActivityReports(
    cursorDoc?: QueryDocumentSnapshot<DocumentData> | null,
    pageSize = 50
  ): Promise<PaginatedReportsResult> {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      throw new Error('Authentication required.');
    }

    try {
      const q = cursorDoc
        ? query(
            collection(db, this.collectionName),
            orderBy('createdAt', 'desc'),
            startAfter(cursorDoc),
            limit(pageSize)
          )
        : query(
            collection(db, this.collectionName),
            orderBy('createdAt', 'desc'),
            limit(pageSize)
          );
      const snap = await getDocs(q);
      const reports = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          activityId: data.activityId || '',
          activityTitle: data.activityTitle || 'Campus Activity',
          reporterUid: data.reporterUid || '',
          reason: (data.reason as ReportReason) || 'Other',
          details: data.details || '',
          status: (data.status as ReportStatus) || 'open',
          reviewedByAdmin: data.reviewedByAdmin,
          reviewedAt: data.reviewedAt ? parseTimestampISO(data.reviewedAt) : undefined,
          adminNote: data.adminNote,
          createdAt: parseTimestampISO(data.createdAt),
          updatedAt: parseTimestampISO(data.updatedAt),
        };
      });
      return {
        reports,
        lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
        hasMore: snap.docs.length === pageSize,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.collectionName);
    }
  }

  public async triageActivityReport(
    reportId: string,
    status: 'reviewed' | 'dismissed',
    adminNote?: string
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      throw new Error('Authentication required.');
    }

    const trimmedNote = adminNote?.trim().slice(0, 500);
    const payload: Record<string, unknown> = {
      status,
      reviewedByAdmin: currentUser.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (trimmedNote) {
      payload.adminNote = trimmedNote;
    }

    try {
      await updateDoc(doc(db, this.collectionName, reportId), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${this.collectionName}/${reportId}`);
    }
  }
}

export const reportService = new ReportService();
