-- IJ only: distinguish Material Leak from other failure symptoms.
-- Generic Leakage is hidden from the IJ Injection symptom master to avoid misclassification.
update public.ij_maintenance_symptoms
set active=false,
    updated_at=now()
where code='S007';

update public.ij_maintenance_symptoms
set name_en='Material Leak',
    name_th='วัตถุดิบรั่ว / แมทลีค',
    updated_at=now()
where code='S031';
