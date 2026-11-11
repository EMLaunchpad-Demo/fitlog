import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Card, EmptyState, Row, SectionTitle, StackScroll, Txt } from '@/components/ui';
import { space, useColors } from '@/lib/theme';
import type { Plan } from '@/lib/types';
import { useStore } from '@/store/store';

export default function PlansScreen() {
  const plans = useStore((s) => s.plans);
  const activePlanId = useStore((s) => s.activePlanId);
  const createPlan = useStore((s) => s.createPlan);

  const active = plans.find((p) => p.id === activePlanId);
  const others = plans.filter((p) => p.id !== activePlanId);

  const create = () => {
    const id = createPlan('Mijn schema');
    router.push({ pathname: '/plan/[id]', params: { id, edit: '1' } });
  };

  return (
    <StackScroll>
      {active ? (
        <>
          <SectionTitle title="Actief schema" />
          <PlanCard plan={active} active />
        </>
      ) : (
        <Card tone="alt">
          <Txt variant="dim">
            Geen actief schema. Open een schema en tik op &quot;Maak actief&quot; om het op Vandaag
            te zien.
          </Txt>
        </Card>
      )}

      <SectionTitle title={active ? 'Andere schema’s' : 'Schema’s'} />
      {others.length === 0 && !active ? (
        <EmptyState icon="plans" title="Geen schema's" text="Maak je eerste trainingsschema." />
      ) : (
        others.map((p) => <PlanCard key={p.id} plan={p} />)
      )}

      <Button label="Nieuw schema" icon="plus" variant="secondary" onPress={create} />
    </StackScroll>
  );
}

function PlanCard({ plan, active }: { plan: Plan; active?: boolean }) {
  const c = useColors();
  const total = plan.days.reduce((n, d) => n + d.exercises.length, 0);
  return (
    <Card onPress={() => router.push(`/plan/${plan.id}`)}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={space.sm}>
            <Txt variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {plan.name}
            </Txt>
            {active ? (
              <View
                style={{
                  backgroundColor: c.accentSoft,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 999,
                }}>
                <Txt variant="small" color={c.accent} style={{ fontWeight: '700' }}>
                  Actief
                </Txt>
              </View>
            ) : null}
          </Row>
          {plan.description ? <Txt variant="dim">{plan.description}</Txt> : null}
        </View>
        <Icon name="chevronRight" size={14} color={c.textFaint} />
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {plan.days.map((d) => (
          <View
            key={d.id}
            style={{
              backgroundColor: c.cardAlt,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}>
            <Txt variant="small" style={{ fontWeight: '600', color: c.text }}>
              {d.name}
            </Txt>
          </View>
        ))}
      </Row>
      <Txt variant="small">
        {plan.days.length} {plan.days.length === 1 ? 'dag' : 'dagen'} · {total} oefeningen
      </Txt>
    </Card>
  );
}
